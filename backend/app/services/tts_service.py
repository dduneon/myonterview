"""TTS 서비스 — Kokoro (로컬, OpenAI-compatible /v1/audio/speech).

한국어 지원: Kokoro v1.x 이미지 기준 Korean voice (kf_/km_) 사용.
  kf_  → Korean female
  km_  → Korean male

면접관별 목소리 매핑:
  1 (인사팀 팀장, 여성, 친절)   → kf_bella  (Korean female, 따뜻한)
  2 (개발팀 리드, 남성, 날카로움) → km_michael (Korean male, 빠른)
  3 (경영진, 남성, 압박)         → km_alpha   (Korean male, 묵직한)

Kokoro v1.x 이전 이미지 호환: kf_/km_ 보이스가 없으면 af_bella 등으로 자동 폴백.
"""
import asyncio
import hashlib
from typing import Optional

import httpx
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.storage import upload_bytes

settings = get_settings()

# 면접관별 한국어 보이스 (Kokoro v1.x)
_VOICE_MAP = {
    1: ("kf_bella", 1.0),    # 인사팀 팀장 — 따뜻한 한국어 여성
    2: ("km_michael", 1.05), # 개발팀 리드 — 빠른 한국어 남성
    3: ("km_alpha", 0.9),    # 경영진 — 묵직한 한국어 남성
}
# 한국어 보이스 없는 이전 이미지용 폴백
_FALLBACK_VOICE_MAP = {
    1: ("af_bella", 1.0),
    2: ("am_michael", 1.05),
    3: ("bm_george", 0.9),
}
_DEFAULT = ("kf_bella", 1.0)
_FALLBACK_DEFAULT = ("af_bella", 1.0)


def _cache_key(text: str, voice: str, speed: float) -> str:
    digest = hashlib.md5(f"{text}{voice}{speed}".encode()).hexdigest()
    return f"tts:{digest}"


async def _synthesize(text: str, voice: str, speed: float) -> bytes:
    """Kokoro API 호출 → MP3 bytes.
    
    한국어 보이스 없으면 영어 폴백 보이스로 재시도.
    """
    async with httpx.AsyncClient(base_url=settings.kokoro_url, timeout=60.0) as client:
        payload = {
            "model": "kokoro",
            "input": text,
            "voice": voice,
            "response_format": "mp3",
            "speed": speed,
        }
        resp = await client.post("/v1/audio/speech", json=payload)

        # 보이스 없음 → 폴백 보이스 재시도
        if resp.status_code in (400, 422):
            body = resp.text
            if "voice" in body.lower() or "not found" in body.lower():
                # kf_/km_ → af_/am_ 로 폴백
                fallback_voice = voice.replace("kf_", "af_").replace("km_", "am_")
                if fallback_voice == voice:
                    fallback_voice = "af_bella"
                resp = await client.post(
                    "/v1/audio/speech",
                    json={**payload, "voice": fallback_voice},
                )

        resp.raise_for_status()
        return resp.content


async def generate_tts(
    text: str,
    interviewer_id: int,
    redis_client: aioredis.Redis,
) -> str:
    """TTS 오디오를 생성하고 스토리지 URL을 반환한다. Redis로 24h 캐싱."""
    voice, speed = _VOICE_MAP.get(interviewer_id, _DEFAULT)
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
