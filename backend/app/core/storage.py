"""S3-compatible 스토리지 클라이언트 팩토리.

MinIO(로컬), Cloudflare R2, AWS S3 등
endpoint_url 설정 여부로 자동 분기.
"""
import boto3
from botocore.client import BaseClient
from functools import lru_cache

from app.core.config import get_settings


@lru_cache
def get_s3_client() -> BaseClient:
    settings = get_settings()

    kwargs = dict(
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )
    if settings.aws_s3_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_s3_endpoint_url

    return boto3.client("s3", **kwargs)


def upload_bytes(data: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """파일 업로드 후 공개 URL 반환."""
    settings = get_settings()
    client = get_s3_client()

    client.put_object(
        Bucket=settings.aws_s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )

    # 공개 URL: 브라우저가 접근 가능한 주소로 반환
    # aws_s3_public_url이 있으면 사용 (로컬 MinIO: http://localhost:9000)
    # 없으면 endpoint_url 그대로, 둘 다 없으면 AWS S3 기본 URL
    base = settings.aws_s3_public_url or settings.aws_s3_endpoint_url
    if base:
        return f"{base}/{settings.aws_s3_bucket}/{key}"

    return f"https://{settings.aws_s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"
