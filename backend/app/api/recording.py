"""면접 녹화본 업로드 API."""
import asyncio
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.storage import upload_bytes
from app.models.schemas import InterviewSession

router = APIRouter(prefix="/api/session", tags=["recording"])


class RecordingResponse(BaseModel):
    recording_url: str


@router.post("/{session_id}/recording", response_model=RecordingResponse)
async def upload_recording(
    session_id: str,
    recording: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """면접 녹화본(webm/mp4)을 스토리지에 저장하고 URL을 반환한다."""
    session = await db.get(InterviewSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    recording_bytes = await recording.read()
    content_type = recording.content_type or "video/webm"
    ext = "mp4" if "mp4" in content_type else "webm"
    s3_key = f"recordings/{session_id}.{ext}"

    loop = asyncio.get_event_loop()
    recording_url = await loop.run_in_executor(
        None,
        lambda: upload_bytes(recording_bytes, s3_key, content_type),
    )

    session.recording_url = recording_url
    await db.commit()

    return RecordingResponse(recording_url=recording_url)
