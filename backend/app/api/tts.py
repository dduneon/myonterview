"""TTS 온디맨드 생성 API."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.services.tts_service import generate_tts

settings = get_settings()
router = APIRouter(prefix="/api/tts", tags=["tts"])


class TTSRequest(BaseModel):
    text: str
    interviewer_id: int = 1


class TTSResponse(BaseModel):
    audio_url: str


@router.post("", response_model=TTSResponse)
async def create_tts(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text가 비어 있습니다.")

    redis_client = aioredis.from_url(settings.redis_url)
    try:
        audio_url = await generate_tts(req.text, req.interviewer_id, redis_client)
    finally:
        await redis_client.aclose()

    return TTSResponse(audio_url=audio_url)
