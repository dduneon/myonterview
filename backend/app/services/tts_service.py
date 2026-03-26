"""TTS 서비스 — Supertonic (온디바이스, 한국어 지원, 167x 실시간 속도).

면접관별 목소리:
  1 (인사팀 팀장, 여성) → F1
  2 (개발팀 리드, 남성) → M1
  3 (경영진, 남성)      → M2
"""
import asyncio
import hashlib
import os
import tempfile
from typing import Optional

import redis.asyncio as aioredis

from app.core.storage import upload_bytes

# 모델은 최초 1회만 로드 (약 300MB 다운로드)
_tts = None

def _get_tts():
    global _tts
    if _tts is None:
        from supertonic import TTS
        _tts = TTS(auto_download=True)
    return _tts


_VOICE_MAP = {
    1: "F1",   # 인사팀 팀장 — 여성
    2: "M1",   # 개발팀 리드 — 남성
    3: "M2",   # 경영진 — 남성
}
_DEFAULT_VOICE = "F1"


def _cache_key(text: str, voice: str) -> str:
    digest = hashlib.md5(f"{text}{voice}".encode()).hexdigest()
    return f"tts:{digest}"


def _synthesize_sync(text: str, voice_name: str) -> bytes:
    tts = _get_tts()
    style = tts.get_voice_style(voice_name=voice_name)
    wav, _ = tts.synthesize(text, voice_style=style, lang="ko")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name
    try:
        tts.save_audio(wav, tmp_path)
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(tmp_path)


async def generate_tts(
    text: str,
    interviewer_id: int,
    redis_client: aioredis.Redis,
) -> str:
    """TTS 오디오를 생성하고 스토리지 URL을 반환한다. Redis로 24h 캐싱."""
    voice = _VOICE_MAP.get(interviewer_id, _DEFAULT_VOICE)
    key = _cache_key(text, voice)

    cached_url: Optional[bytes] = await redis_client.get(key)
    if cached_url:
        return cached_url.decode()

    loop = asyncio.get_event_loop()
    audio_bytes = await loop.run_in_executor(None, _synthesize_sync, text, voice)

    s3_key = f"tts/{key}.wav"
    audio_url = await loop.run_in_executor(
        None, lambda: upload_bytes(audio_bytes, s3_key, "audio/wav")
    )

    await redis_client.setex(key, 86_400, audio_url)
    return audio_url
