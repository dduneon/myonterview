"""WebSocket 면접 세션 실시간 이벤트 핸들러."""
import asyncio
import json
import base64
from datetime import datetime, timezone

import redis.asyncio as aioredis
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.schemas import InterviewSession, Question, Answer, SessionStatus
from app.services.tts_service import generate_tts
from app.services.stt_service import transcribe
from app.tasks.celery_tasks import task_generate_feedback

settings = get_settings()

STT_TIMEOUT_SEC = 30  # STT 변환 최대 대기 시간


class ConnectionManager:
    """활성 WebSocket 연결 관리."""

    def __init__(self):
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, session_id: str, ws: WebSocket):
        await ws.accept()
        self._connections[session_id] = ws

    def disconnect(self, session_id: str):
        self._connections.pop(session_id, None)

    async def send(self, session_id: str, data: dict):
        ws = self._connections.get(session_id)
        if ws:
            await ws.send_text(json.dumps(data, ensure_ascii=False))


manager = ConnectionManager()


async def _send_question(
    ws: WebSocket,
    question: Question,
    total: int,
    redis_client: aioredis.Redis,
):
    """TTS 생성 후 QUESTION 이벤트 전송. TTS 실패 시 audio_url=None으로 계속 진행."""
    audio_url = None
    try:
        audio_url = await generate_tts(question.text, question.interviewer_id, redis_client)
        # DB에도 저장
        async with AsyncSessionLocal() as db:
            q = await db.get(Question, question.id)
            if q:
                q.audio_url = audio_url
                await db.commit()
    except Exception as e:
        # TTS 실패해도 텍스트 질문은 전송
        pass

    await ws.send_text(json.dumps({
        "event": "QUESTION",
        "question_id": question.id,
        "text": question.text,
        "audio_url": audio_url,
        "interviewer_id": question.interviewer_id,
        "index": question.order_index + 1,
        "total": total,
    }, ensure_ascii=False))


async def _prefetch_tts(questions: list[Question], redis_client: aioredis.Redis):
    """나머지 질문들의 TTS를 백그라운드로 미리 생성해 Redis에 캐싱."""
    async def _gen(q: Question):
        try:
            await generate_tts(q.text, q.interviewer_id, redis_client)
        except Exception:
            pass

    await asyncio.gather(*[_gen(q) for q in questions], return_exceptions=True)


async def interview_ws_handler(websocket: WebSocket, session_id: str):
    """면접 WebSocket 이벤트 루프."""
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=False)
    await manager.connect(session_id, websocket)

    try:
        async with AsyncSessionLocal() as db:
            session = await db.get(InterviewSession, session_id)
            if not session or session.status not in (
                SessionStatus.QUESTIONS_READY, SessionStatus.IN_PROGRESS
            ):
                await websocket.send_text(json.dumps({
                    "event": "ERROR",
                    "code": "SESSION_NOT_READY",
                    "message": "세션이 준비되지 않았습니다.",
                }))
                return

        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            event = msg.get("event")

            # ── START_INTERVIEW ─────────────────────────────────────────
            if event == "START_INTERVIEW":
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(Question)
                        .where(Question.session_id == session_id)
                        .order_by(Question.order_index)
                    )
                    questions = result.scalars().all()

                    # 이미 답변된 질문 ID 조회 (재연결 시 이어서 진행)
                    ans_result = await db.execute(
                        select(Answer.question_id)
                        .where(Answer.session_id == session_id)
                    )
                    answered_ids = {row[0] for row in ans_result.fetchall()}

                    session = await db.get(InterviewSession, session_id)
                    session.status = SessionStatus.IN_PROGRESS
                    await db.commit()

                if not questions:
                    await websocket.send_text(json.dumps({
                        "event": "ERROR",
                        "code": "NO_QUESTIONS",
                        "message": "생성된 질문이 없습니다.",
                    }))
                    return

                # 미답변 질문 목록
                unanswered = [q for q in questions if q.id not in answered_ids]

                if not unanswered:
                    # 이미 모두 답변 완료 → 종료
                    await websocket.send_text(json.dumps({"event": "INTERVIEW_DONE"}))
                    continue

                # 첫 번째 미답변 질문 전송
                first_q = unanswered[0]
                await _send_question(websocket, first_q, len(questions), redis_client)

                # 나머지 질문 TTS 사전 생성 (백그라운드, 첫 질문 제외)
                if len(unanswered) > 1:
                    asyncio.create_task(_prefetch_tts(unanswered[1:], redis_client))

            # ── ANSWER_DONE ─────────────────────────────────────────────
            elif event == "ANSWER_DONE":
                question_id = msg.get("question_id")
                audio_b64 = msg.get("audio_b64", "")
                skipped = msg.get("skipped", False)

                transcript = ""
                if not skipped and audio_b64:
                    try:
                        audio_bytes = base64.b64decode(audio_b64)
                        transcript = await asyncio.wait_for(
                            transcribe(audio_bytes),
                            timeout=STT_TIMEOUT_SEC,
                        )
                    except asyncio.TimeoutError:
                        transcript = ""  # 타임아웃 시 빈 transcript로 계속 진행
                    except Exception:
                        transcript = ""

                async with AsyncSessionLocal() as db:
                    answer = Answer(
                        question_id=question_id,
                        session_id=session_id,
                        transcript=transcript,
                        skipped=skipped,
                    )
                    db.add(answer)
                    await db.commit()

                await websocket.send_text(json.dumps({
                    "event": "ANSWER_SAVED",
                    "question_id": question_id,
                    "transcript": transcript,
                }, ensure_ascii=False))

                # 다음 질문 조회
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(Question)
                        .where(Question.session_id == session_id)
                        .order_by(Question.order_index)
                    )
                    questions = result.scalars().all()

                    ans_result = await db.execute(
                        select(Answer.question_id)
                        .where(Answer.session_id == session_id)
                    )
                    answered_ids = {row[0] for row in ans_result.fetchall()}

                unanswered = [q for q in questions if q.id not in answered_ids]

                if unanswered:
                    await _send_question(websocket, unanswered[0], len(questions), redis_client)
                else:
                    await websocket.send_text(json.dumps({"event": "INTERVIEW_DONE"}))

            # ── END_INTERVIEW ────────────────────────────────────────────
            elif event == "END_INTERVIEW":
                async with AsyncSessionLocal() as db:
                    session = await db.get(InterviewSession, session_id)
                    if session:
                        session.status = SessionStatus.COMPLETED
                        session.ended_at = datetime.now(timezone.utc)
                        await db.commit()

                task_generate_feedback.delay(session_id)

                await websocket.send_text(json.dumps({
                    "event": "FEEDBACK_PROCESSING",
                    "message": "피드백을 생성 중입니다. 잠시 후 확인하세요.",
                }))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({
                "event": "ERROR",
                "code": "SERVER_ERROR",
                "message": str(e),
            }))
        except Exception:
            pass
    finally:
        manager.disconnect(session_id)
        await redis_client.aclose()
