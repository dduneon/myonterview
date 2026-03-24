"""Edge TTS — 생성 결과를 MinIO/S3에 캐싱.

Microsoft Edge Neural TTS (무료, API 키 불필요).
한국어 음성: ko-KR-SunHiNeural (여성) / ko-KR-InJoonNeural (남성)
면접관별 rate/pitch 조정으로 목소리 차별화.
"""
import hashlib
import asyncio
from typing import Optional

import edge_tts
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.storage import upload_bytes

settings = get_settings()

# 면접관 ID → Edge TTS 설정
# rate: 말하는 속도 (+x% 빠름 / -x% 느림)
# pitch: 음높이 (+xHz 높음 / -xHz 낮음)
INTERVIEWER_VOICE: dict[int, dict] = {
    1: {
        "voice": "ko-KR-SunHiNeural",  # 인사팀 팀장 / 40대 여성, 차분
        "rate": "-5%",
        "pitch": "-2Hz",
    },
    2: {
        "voice": "ko-KR-InJoonNeural",  # 개발팀 리드 / 30대 남성, 중립
        "rate": "+0%",
        "pitch": "+0Hz",
    },
    3: {
        "voice": "ko-KR-InJoonNeural",  # 경영진 / 50대 남성, 낮고 느림
        "rate": "-10%",
        "pitch": "-10Hz",
    },
}
_DEFAULT_VOICE = INTERVIEWER_VOICE[1]


def _cache_key(text: str, voice: str, rate: str, pitch: str) -> str:
    digest = hashlib.md5(f"{text}{voice}{rate}{pitch}".encode()).hexdigest()
    return f"tts:{digest}"


async def _synthesize(text: str, voice: str, rate: str, pitch: str) -> bytes:
    """Edge TTS 호출 → MP3 bytes 반환."""
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    audio_chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])
    return b"".join(audio_chunks)


async def generate_tts(
    text: str,
    interviewer_id: int,
    redis_client: aioredis.Redis,
) -> str:
    """TTS 오디오를 생성하고 스토리지 URL을 반환한다. Redis로 24h 캐싱."""
    cfg = INTERVIEWER_VOICE.get(interviewer_id, _DEFAULT_VOICE)
    voice, rate, pitch = cfg["voice"], cfg["rate"], cfg["pitch"]

    key = _cache_key(text, voice, rate, pitch)

    # Redis 캐시 확인
    cached_url: Optional[bytes] = await redis_client.get(key)
    if cached_url:
        return cached_url.decode()

    # Edge TTS 합성
    audio_bytes = await _synthesize(text, voice, rate, pitch)

    # MinIO / S3 업로드
    s3_key = f"tts/{key}.mp3"
    loop = asyncio.get_event_loop()
    audio_url = await loop.run_in_executor(
        None,
        lambda: upload_bytes(audio_bytes, s3_key, "audio/mpeg"),
    )

    # Redis 캐싱 (24h)
    await redis_client.setex(key, 86_400, audio_url)

    return audio_url
