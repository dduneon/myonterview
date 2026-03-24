"""WebSocket 면접 세션 실시간 이벤트 핸들러."""
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
    """TTS 생성 후 QUESTION 이벤트 전송."""
    audio_url = await generate_tts(question.text, question.interviewer_id, redis_client)

    # audio_url을 DB에도 저장
    async with AsyncSessionLocal() as db:
        q = await db.get(Question, question.id)
        if q:
            q.audio_url = audio_url
            await db.commit()

    await ws.send_text(json.dumps({
        "event": "QUESTION",
        "question_id": question.id,
        "text": question.text,
        "audio_url": audio_url,
        "interviewer_id": question.interviewer_id,
        "index": question.order_index + 1,
        "total": total,
    }, ensure_ascii=False))


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

                # 첫 번째 질문 전송
                await _send_question(websocket, questions[0], len(questions), redis_client)

            # ── ANSWER_DONE ─────────────────────────────────────────────
            elif event == "ANSWER_DONE":
                question_id = msg.get("question_id")
                audio_b64 = msg.get("audio_b64", "")
                skipped = msg.get("skipped", False)

                transcript = ""
                if not skipped and audio_b64:
                    audio_bytes = base64.b64decode(audio_b64)
                    transcript = await transcribe(audio_bytes)

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
                    answered_q = next((q for q in questions if q.id == question_id), None)

                if answered_q:
                    next_idx = answered_q.order_index + 1
                    next_qs = [q for q in questions if q.order_index == next_idx]
                    if next_qs:
                        await _send_question(websocket, next_qs[0], len(questions), redis_client)
                    else:
                        # 마지막 질문 완료 → 면접 종료 신호
                        await websocket.send_text(json.dumps({"event": "INTERVIEW_DONE"}))

            # ── END_INTERVIEW ────────────────────────────────────────────
            elif event == "END_INTERVIEW":
                async with AsyncSessionLocal() as db:
                    session = await db.get(InterviewSession, session_id)
                    if session:
                        session.status = SessionStatus.COMPLETED
                        session.ended_at = datetime.now(timezone.utc)
                        await db.commit()

                # Celery로 피드백 생성 비동기 시작
                task_generate_feedback.delay(session_id)

                await websocket.send_text(json.dumps({
                    "event": "FEEDBACK_PROCESSING",
                    "message": "피드백을 생성 중입니다. 잠시 후 확인하세요.",
                }))

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(session_id)
        await redis_client.aclose()
