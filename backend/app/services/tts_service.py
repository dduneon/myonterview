"""TTS 서비스 — Kokoro (로컬, OpenAI-compatible /v1/audio/speech).

면접관별 목소리 매핑:
  1 (인사팀 팀장, 여성, 친절) → af_bella
  2 (개발팀 리드, 남성, 날카로움) → am_michael
  3 (경영진, 남성, 압박) → bm_george
"""
import asyncio
import hashlib
from typing import Optional

import httpx
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.storage import upload_bytes

settings = get_settings()

_VOICE_MAP = {
    1: ("af_bella", 1.0),    # 인사팀 팀장 — 따뜻한 여성
    2: ("am_michael", 1.05), # 개발팀 리드 — 빠른 남성
    3: ("bm_george", 0.9),   # 경영진 — 느리고 묵직한 남성
}
_DEFAULT_VOICE = ("af_bella", 1.0)


def _cache_key(text: str, voice: str, speed: float) -> str:
    digest = hashlib.md5(f"{text}{voice}{speed}".encode()).hexdigest()
    return f"tts:{digest}"


async def _synthesize(text: str, voice: str, speed: float) -> bytes:
    """Kokoro API 호출 → MP3 bytes."""
    async with httpx.AsyncClient(base_url=settings.kokoro_url, timeout=60.0) as client:
        resp = await client.post(
            "/v1/audio/speech",
            json={
                "model": "kokoro",
                "input": text,
                "voice": voice,
                "response_format": "mp3",
                "speed": speed,
            },
        )
        resp.raise_for_status()
        return resp.content


async def generate_tts(
    text: str,
    interviewer_id: int,
    redis_client: aioredis.Redis,
) -> str:
    """TTS 오디오를 생성하고 스토리지 URL을 반환한다. Redis로 24h 캐싱."""
    voice, speed = _VOICE_MAP.get(interviewer_id, _DEFAULT_VOICE)
    key = _cache_key(text, voice, speed)

    cached_url: Optional[bytes] = await redis_client.get(key)
    if cached_url:
        return cached_url.decode()

    audio_bytes = await _synthesize(text, voice, speed)

    s3_key = f"tts/{key}.mp3"
    loop = asyncio.get_event_loop()
    audio_url = await loop.run_in_executor(
        None,
        lambda: upload_bytes(audio_bytes, s3_key, "audio/mpeg"),
    )

    await redis_client.setex(key, 86_400, audio_url)
    return audio_url
