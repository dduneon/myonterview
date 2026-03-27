"""Celery 비동기 작업: 질문 생성, 피드백 생성."""
from celery import Celery
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.services.question_gen import generate_questions
from app.services.feedback_gen import generate_feedback
from app.models.schemas import (
    InterviewSession, Question, Answer, Feedback, SessionStatus, QuestionCategory
)

settings = get_settings()

celery_app = Celery(
    "myonterview",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"

# Celery는 동기 SQLAlchemy 사용
_sync_db_url = settings.database_url.replace("+asyncpg", "")
_engine = create_engine(_sync_db_url)
_Session = sessionmaker(bind=_engine)


@celery_app.task(bind=True, max_retries=5)
def task_generate_questions(
    self,
    session_id: str,
    resume_text: str,
    company: str,
    job_title: str,
    interview_type: str,
    portfolio_text: str = "",
    interviewer_count: int = 3,
):
    """이력서·회사 정보 기반 질문을 생성하고 DB에 저장."""
    db = _Session()
    try:
        questions_data = generate_questions(
            resume_text=resume_text,
            company=company,
            job_title=job_title,
            interview_type=interview_type,
            portfolio_text=portfolio_text or None,
            interviewer_count=interviewer_count,
        )

        for idx, q in enumerate(questions_data):
            question = Question(
                session_id=session_id,
                text=q["text"],
                category=QuestionCategory(q["category"]),
                interviewer_id=q["interviewer_id"],
                order_index=idx,
            )
            db.add(question)

        session = db.query(InterviewSession).filter_by(id=session_id).first()
        if session:
            session.status = SessionStatus.QUESTIONS_READY

        db.commit()
    except Exception as exc:
        db.rollback()
        session = db.query(InterviewSession).filter_by(id=session_id).first()
        if session:
            session.status = SessionStatus.FAILED
        db.commit()
        # rate limit 감지 시 대기 시간 늘림 (지수 백오프)
        wait = 10 * (2 ** self.request.retries)  # 10s → 20s → 40s → 80s → 160s
        raise self.retry(exc=exc, countdown=wait)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=3)
def task_generate_feedback(self, session_id: str):
    """면접 세션의 Q&A를 평가하고 피드백 DB에 저장."""
    db = _Session()
    try:
        session = db.query(InterviewSession).filter_by(id=session_id).first()
        if not session:
            return

        qa_pairs = []
        for q in session.questions:
            answer = db.query(Answer).filter_by(question_id=q.id).first()
            qa_pairs.append({
                "question": q.text,
                "answer": answer.transcript if answer and not answer.skipped else "",
                "category": q.category.value,
            })

        result = generate_feedback(
            qa_pairs=qa_pairs,
            company=session.company,
            job_title=session.job_title,
        )

        feedback = Feedback(
            session_id=session_id,
            overall_score=result.get("overall_score"),
            structure_score=result.get("category_scores", {}).get("structure"),
            specificity_score=result.get("category_scores", {}).get("specificity"),
            job_fit_score=result.get("category_scores", {}).get("job_fit"),
            communication_score=result.get("category_scores", {}).get("communication"),
            strengths=result.get("strengths", []),
            improvements=result.get("improvements", []),
            question_feedbacks=result.get("question_reviews", []),
        )
        db.add(feedback)
        db.commit()
    except Exception as exc:
        db.rollback()
        wait = 15 * (2 ** self.request.retries)  # 15s → 30s → 60s
        raise self.retry(exc=exc, countdown=wait)
    finally:
        db.close()
