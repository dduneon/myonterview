"""Naver CLOVA Voice TTS — 생성 결과를 S3에 캐싱."""
import hashlib
import asyncio
from typing import Optional

import httpx
import boto3
import redis.asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()

NAVER_TTS_URL = "https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts"

# 면접관 ID → CLOVA 스피커 매핑
INTERVIEWER_SPEAKER = {
    1: "nara",    # 인사팀 팀장 / 차분한 여성
    2: "jinho",   # 개발팀 리드 / 중립 남성
    3: "mijin",   # 경영진 / 압박 스타일
}


def _cache_key(text: str, speaker: str) -> str:
    digest = hashlib.md5(f"{text}{speaker}".encode()).hexdigest()
    return f"tts:{digest}"


def _s3_key(cache_key: str) -> str:
    return f"tts/{cache_key}.mp3"


async def _upload_to_s3(audio_bytes: bytes, s3_key: str) -> str:
    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: s3.put_object(
            Bucket=settings.aws_s3_bucket,
            Key=s3_key,
            Body=audio_bytes,
            ContentType="audio/mpeg",
        ),
    )
    return f"https://{settings.aws_s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{s3_key}"


async def generate_tts(text: str, interviewer_id: int, redis_client: aioredis.Redis) -> str:
    """TTS 오디오를 생성하고 S3 URL을 반환한다. Redis로 24h 캐싱."""
    speaker = INTERVIEWER_SPEAKER.get(interviewer_id, "nara")
    key = _cache_key(text, speaker)

    # 캐시 확인
    cached_url: Optional[bytes] = await redis_client.get(key)
    if cached_url:
        return cached_url.decode()

    # Naver CLOVA 호출
    async with httpx.AsyncClient() as client:
        response = await client.post(
            NAVER_TTS_URL,
            headers={
                "X-NCP-APIGW-API-KEY-ID": settings.naver_tts_client_id,
                "X-NCP-APIGW-API-KEY": settings.naver_tts_client_secret,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"speaker": speaker, "text": text, "format": "mp3", "speed": "0"},
            timeout=30,
        )
        response.raise_for_status()
        audio_bytes = response.content

    # S3 업로드
    audio_url = await _upload_to_s3(audio_bytes, _s3_key(key))

    # Redis 캐싱 (24h)
    await redis_client.setex(key, 86400, audio_url)

    return audio_url
