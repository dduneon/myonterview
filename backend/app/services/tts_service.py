"""TTS 서비스 — gTTS (Google, 한국어 완벽 지원) + MinIO/S3 캐싱.

면접관별 속도 분기:
  1 (인사팀 팀장) → 보통 속도
  2 (개발팀 리드) → 약간 빠름 (slow=False, 기본)
  3 (경영진)      → 느린 속도 (slow=True, 압박감)
"""
import asyncio
import hashlib
import io
from typing import Optional

import redis.asyncio as aioredis
from gtts import gTTS

from app.core.storage import upload_bytes


def _cache_key(text: str, slow: bool) -> str:
    digest = hashlib.md5(f"{text}{slow}".encode()).hexdigest()
    return f"tts:{digest}"


def _synthesize_sync(text: str, slow: bool) -> bytes:
    tts = gTTS(text=text, lang="ko", slow=slow)
    buf = io.BytesIO()
    tts.write_to_fp(buf)
    buf.seek(0)
    return buf.read()


async def generate_tts(
    text: str,
    interviewer_id: int,
    redis_client: aioredis.Redis,
) -> str:
    """TTS 오디오를 생성하고 스토리지 URL을 반환한다. Redis로 24h 캐싱."""
    slow = interviewer_id == 3  # 경영진만 느리게
    key = _cache_key(text, slow)

    cached_url: Optional[bytes] = await redis_client.get(key)
    if cached_url:
        return cached_url.decode()

    loop = asyncio.get_event_loop()
    audio_bytes = await loop.run_in_executor(None, _synthesize_sync, text, slow)

    s3_key = f"tts/{key}.mp3"
    audio_url = await loop.run_in_executor(
        None, lambda: upload_bytes(audio_bytes, s3_key, "audio/mpeg")
    )

    await redis_client.setex(key, 86_400, audio_url)
    return audio_url
