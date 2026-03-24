from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, DateTime,
    ForeignKey, JSON, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base


class SessionStatus(str, enum.Enum):
    PENDING = "pending"
    QUESTIONS_READY = "questions_ready"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class QuestionCategory(str, enum.Enum):
    INTRO = "intro"
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    SITUATIONAL = "situational"
    CLOSING = "closing"


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sessions = relationship("InterviewSession", back_populates="user")


class InterviewSession(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    company = Column(String, nullable=False)
    job_title = Column(String, nullable=False)
    interview_type = Column(String, default="신입")  # 신입/경력
    duration_minutes = Column(Integer, default=30)
    status = Column(SAEnum(SessionStatus), default=SessionStatus.PENDING)
    resume_path = Column(String, nullable=True)
    portfolio_path = Column(String, nullable=True)
    portfolio_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="sessions")
    questions = relationship("Question", back_populates="session", order_by="Question.order_index")
    answers = relationship("Answer", back_populates="session")
    feedback = relationship("Feedback", back_populates="session", uselist=False)


class Interviewer(Base):
    __tablename__ = "interviewers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    persona = Column(Text, nullable=True)
    tts_speaker_id = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)       # 2D fallback image
    avatar_model_url = Column(String, nullable=True)  # .glb 3D model


class Question(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    text = Column(Text, nullable=False)
    audio_url = Column(String, nullable=True)
    interviewer_id = Column(Integer, nullable=False)  # 1~3
    order_index = Column(Integer, nullable=False)
    category = Column(SAEnum(QuestionCategory), nullable=False)

    session = relationship("InterviewSession", back_populates="questions")
    answer = relationship("Answer", back_populates="question", uselist=False)


class Answer(Base):
    __tablename__ = "answers"

    id = Column(String, primary_key=True, default=gen_uuid)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    audio_path = Column(String, nullable=True)
    transcript = Column(Text, nullable=True)
    duration_sec = Column(Float, nullable=True)
    skipped = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    question = relationship("Question", back_populates="answer")
    session = relationship("InterviewSession", back_populates="answers")


class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, unique=True)
    overall_score = Column(Integer, nullable=True)
    structure_score = Column(Integer, nullable=True)
    specificity_score = Column(Integer, nullable=True)
    job_fit_score = Column(Integer, nullable=True)
    communication_score = Column(Integer, nullable=True)
    strengths = Column(JSON, default=list)       # List[str]
    improvements = Column(JSON, default=list)    # List[str]
    question_feedbacks = Column(JSON, default=list)  # List[{question_id, comment, score}]
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("InterviewSession", back_populates="feedback")
