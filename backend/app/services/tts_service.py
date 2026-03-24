"""gTTS (Google TTS) — 생성 결과를 MinIO/S3에 캐싱.

edge-tts는 Docker 환경에서 Microsoft 서버에 403 차단 이슈가 있어
gTTS로 대체. 무료, API 키 불필요, Docker 정상 동작.

추후 목소리 품질 개선이 필요하면:
- 로컬 Kokoro TTS
- OpenAI TTS API (/v1/audio/speech) — provider가 지원하는 경우
"""
import hashlib
import asyncio
import io
from typing import Optional

from gtts import gTTS
import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.storage import upload_bytes

settings = get_settings()


def _cache_key(text: str, lang: str, slow: bool) -> str:
    digest = hashlib.md5(f"{text}{lang}{slow}".encode()).hexdigest()
    return f"tts:{digest}"


def _synthesize_sync(text: str, slow: bool = False) -> bytes:
    """gTTS 호출 → MP3 bytes (동기)."""
    tts = gTTS(text=text, lang="ko", slow=slow)
    fp = io.BytesIO()
    tts.write_to_fp(fp)
    fp.seek(0)
    return fp.read()


async def generate_tts(
    text: str,
    interviewer_id: int,
    redis_client: aioredis.Redis,
) -> str:
    """TTS 오디오를 생성하고 스토리지 URL을 반환한다. Redis로 24h 캐싱.

    면접관 ID별 속도 분기:
      1 (인사팀 팀장) — 보통 속도
      2 (개발팀 리드) — 보통 속도
      3 (경영진)      — 느린 속도 (압박감)
    """
    slow = interviewer_id == 3
    key = _cache_key(text, "ko", slow)

    # Redis 캐시 확인
    cached_url: Optional[bytes] = await redis_client.get(key)
    if cached_url:
        return cached_url.decode()

    # gTTS 합성 (blocking → executor에서 실행)
    loop = asyncio.get_event_loop()
    audio_bytes = await loop.run_in_executor(None, _synthesize_sync, text, slow)

    # MinIO / S3 업로드
    s3_key = f"tts/{key}.mp3"
    audio_url = await loop.run_in_executor(
        None,
        lambda: upload_bytes(audio_bytes, s3_key, "audio/mpeg"),
    )

    # Redis 캐싱 (24h)
    await redis_client.setex(key, 86_400, audio_url)

    return audio_url
