"""STT 변환 API."""
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.schemas import Answer
from app.services.stt_service import transcribe

router = APIRouter(prefix="/api/stt", tags=["stt"])


class STTResponse(BaseModel):
    transcript: str
    question_id: str


@router.post("", response_model=STTResponse)
async def convert_stt(
    audio_file: UploadFile = File(...),
    question_id: str = Form(...),
    session_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    audio_bytes = await audio_file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="오디오 파일이 비어 있습니다.")

    suffix = "." + (audio_file.filename or "audio.webm").split(".")[-1]
    transcript = await transcribe(audio_bytes, suffix=suffix)

    answer = Answer(
        question_id=question_id,
        session_id=session_id,
        transcript=transcript,
        skipped=False,
    )
    db.add(answer)
    await db.commit()

    return STTResponse(transcript=transcript, question_id=question_id)
