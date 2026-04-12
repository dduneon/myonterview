"""면접 세션 생성 및 조회 API."""
import uuid
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.config import get_settings
from app.models.schemas import InterviewSession, Question, SessionStatus
from app.services.file_parser import extract_text
from app.tasks.celery_tasks import task_generate_questions

settings = get_settings()
router = APIRouter(prefix="/api/session", tags=["session"])


def get_redis():
    return aioredis.from_url(settings.redis_url)


class SessionResponse(BaseModel):
    id: str
    status: str
    company: str
    job_title: str
    interviewer_count: int = 3
    recording_url: str | None = None


@router.post("", response_model=SessionResponse)
async def create_session(
    company: str = Form(...),
    job_title: str = Form(...),
    interview_type: str = Form("신입"),
    duration_minutes: int = Form(30),
    interviewer_count: int = Form(3),
    resume_file: UploadFile = File(...),
    portfolio_file: Optional[UploadFile] = File(None),
    portfolio_url: Optional[str] = Form(None),
    jd_text: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """이력서 업로드 + 세션 생성 → 질문 생성을 비동기로 시작."""
    # 이력서 파싱
    resume_bytes = await resume_file.read()
    try:
        resume_text = extract_text(resume_bytes, resume_file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 포트폴리오 파싱 (선택)
    portfolio_text = ""
    if portfolio_file:
        portfolio_bytes = await portfolio_file.read()
        try:
            portfolio_text = extract_text(portfolio_bytes, portfolio_file.filename)
        except ValueError:
            pass

    session = InterviewSession(
        id=str(uuid.uuid4()),
        company=company,
        job_title=job_title,
        interview_type=interview_type,
        duration_minutes=duration_minutes,
        interviewer_count=interviewer_count,
        portfolio_url=portfolio_url,
        status=SessionStatus.PENDING,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # 질문 생성 Celery 태스크 시작
    task_generate_questions.delay(
        session_id=session.id,
        resume_text=resume_text,
        company=company,
        job_title=job_title,
        interview_type=interview_type,
        portfolio_text=portfolio_text,
        interviewer_count=interviewer_count,
        jd_text=jd_text or "",
    )

    return SessionResponse(
        id=session.id,
        status=session.status.value,
        company=session.company,
        job_title=session.job_title,
        interviewer_count=session.interviewer_count,
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await db.get(InterviewSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    return SessionResponse(
        id=session.id,
        status=session.status.value,
        company=session.company,
        job_title=session.job_title,
        interviewer_count=session.interviewer_count,
    )


class QuestionOut(BaseModel):
    id: str
    text: str
    audio_url: Optional[str]
    interviewer_id: int
    order_index: int
    category: str


@router.get("/{session_id}/questions", response_model=list[QuestionOut])
async def get_questions(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Question)
        .where(Question.session_id == session_id)
        .order_by(Question.order_index)
    )
    questions = result.scalars().all()
    return [
        QuestionOut(
            id=q.id,
            text=q.text,
            audio_url=q.audio_url,
            interviewer_id=q.interviewer_id,
            order_index=q.order_index,
            category=q.category.value,
        )
        for q in questions
    ]
