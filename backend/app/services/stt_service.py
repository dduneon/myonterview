"""OpenAI Whisper STT — 음성 bytes → 텍스트."""
import tempfile
import os

from openai import AsyncOpenAI

from app.core.config import get_settings

settings = get_settings()
_client = AsyncOpenAI(api_key=settings.openai_api_key)


async def transcribe(audio_bytes: bytes, suffix: str = ".webm") -> str:
    """음성 바이트를 받아 한국어 텍스트로 변환한다."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        with open(tmp_path, "rb") as audio_file:
            result = await _client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="ko",
            )
        return result.text
    finally:
        os.unlink(tmp_path)
