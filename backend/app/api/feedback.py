"""피드백 리포트 조회 API."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.schemas import Feedback, InterviewSession, SessionStatus

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackResponse(BaseModel):
    session_id: str
    overall_score: Optional[int]
    structure_score: Optional[int]
    specificity_score: Optional[int]
    job_fit_score: Optional[int]
    communication_score: Optional[int]
    strengths: list[str]
    improvements: list[str]
    question_feedbacks: list[dict]


@router.get("/{session_id}", response_model=FeedbackResponse)
async def get_feedback(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await db.get(InterviewSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    if session.status != SessionStatus.COMPLETED:
        raise HTTPException(status_code=202, detail="피드백 생성 중입니다. 잠시 후 다시 시도해주세요.")

    feedback = await db.get(Feedback, session_id)
    # Feedback PK는 session_id와 다를 수 있으므로 세션 relation으로 조회
    if not feedback:
        # session.feedback relation으로 재조회
        await db.refresh(session, ["feedback"])
        feedback = session.feedback

    if not feedback:
        raise HTTPException(status_code=202, detail="피드백 생성 중입니다. 잠시 후 다시 시도해주세요.")

    return FeedbackResponse(
        session_id=session_id,
        overall_score=feedback.overall_score,
        structure_score=feedback.structure_score,
        specificity_score=feedback.specificity_score,
        job_fit_score=feedback.job_fit_score,
        communication_score=feedback.communication_score,
        strengths=feedback.strengths or [],
        improvements=feedback.improvements or [],
        question_feedbacks=feedback.question_feedbacks or [],
    )
