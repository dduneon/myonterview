from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # LLM — OpenAI-compatible API (질문 생성, 피드백)
    llm_api_key: str
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"

    # OpenAI Whisper STT
    openai_api_key: str
    openai_base_url: str = "https://api.openai.com/v1"
    openai_stt_model: str = "whisper-1"  # Groq 사용 시: whisper-large-v3-turbo

    # Tavily
    tavily_api_key: str = ""

    # PostgreSQL
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Object Storage (S3-compatible — MinIO / R2 / B2 등)
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = "myonterview-assets"
    aws_region: str = "us-east-1"
    aws_s3_endpoint_url: str = ""  # 비어 있으면 AWS S3, 값 있으면 해당 엔드포인트 사용

    # App
    secret_key: str = "change-me"
    allowed_origins: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
