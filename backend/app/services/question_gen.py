"""질문 생성 파이프라인 (OpenAI-compatible API + Tavily 웹 검색)."""
import json
from typing import Optional

from openai import OpenAI
from tavily import TavilyClient

from app.core.config import get_settings
from app.models.schemas import QuestionCategory

settings = get_settings()

_llm = OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)
_tavily = TavilyClient(api_key=settings.tavily_api_key) if settings.tavily_api_key else None

INTERVIEWER_PERSONAS = {
    1: "인사팀 팀장 (40대 여성, 친절하고 체계적, 인성·문화 적합성 중심)",
    2: "개발팀 리드 (30대 남성, 날카롭고 기술적, 실무 능력·문제 해결력 중심)",
    3: "경영진 (50대 남성, 압박 스타일, 논리력·위기 대응력·비전 중심)",
}


def _search_company_info(company: str, job_title: str) -> str:
    if not _tavily:
        return ""
    try:
        result = _tavily.search(
            query=f"{company} {job_title} 면접 질문 채용 공고",
            max_results=5,
            search_depth="basic",
        )
        return "\n".join(r.get("content", "") for r in result.get("results", []))
    except Exception:
        return ""


def _build_profile(resume_text: str) -> dict:
    """이력서 텍스트 → 구조화된 프로필 JSON."""
    response = _llm.chat.completions.create(
        model=settings.llm_model,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": f"""아래 이력서 텍스트를 분석해서 JSON으로 구조화해줘.

이력서:
{resume_text[:4000]}

출력 형식 (JSON만, 설명 없이):
{{
  "name": "이름",
  "career_years": 0,
  "skills": ["기술1", "기술2"],
  "projects": ["프로젝트 한 줄 요약"],
  "education": "최종 학력",
  "highlights": ["특이사항1", "특이사항2"]
}}""",
            }
        ],
    )
    try:
        return json.loads(response.choices[0].message.content)
    except Exception:
        return {"raw": resume_text[:2000]}


def generate_questions(
    resume_text: str,
    company: str,
    job_title: str,
    interview_type: str = "신입",
    portfolio_text: Optional[str] = None,
) -> list[dict]:
    """질문 리스트를 생성하고 반환한다.

    Returns:
        [{"text": str, "category": str, "interviewer_id": int}, ...]
    """
    profile = _build_profile(resume_text)
    company_info = _search_company_info(company, job_title)

    portfolio_section = ""
    if portfolio_text:
        portfolio_section = f"\n\n포트폴리오 요약:\n{portfolio_text[:2000]}"

    company_section = ""
    if company_info:
        company_section = f"\n\n회사·직무 정보 (웹 검색 결과):\n{company_info[:2000]}"

    personas_text = "\n".join(
        f"- 면접관 {k}번: {v}" for k, v in INTERVIEWER_PERSONAS.items()
    )

    prompt = f"""당신은 면접 질문 전문가입니다.

## 지원자 프로필
{json.dumps(profile, ensure_ascii=False, indent=2)}
{portfolio_section}

## 지원 정보
- 회사: {company}
- 직무: {job_title}
- 구분: {interview_type}
{company_section}

## 면접관 페르소나
{personas_text}

## 지시사항
위 정보를 바탕으로 면접 질문 10~13개를 생성해줘.
- 카테고리 배분: intro 1~2개, technical 4~5개, behavioral 3~4개, situational 2~3개, closing 1개
- 각 질문은 지원자의 실제 이력서·경험 기반 맞춤형으로 작성
- 면접관 3명에게 균형 있게 배분 (각 페르소나 스타일 반영)
- 한국어로 작성

출력 형식 (JSON 배열만, 설명 없이):
[
  {{"text": "질문 내용", "category": "intro|technical|behavioral|situational|closing", "interviewer_id": 1}}
]"""

    response = _llm.chat.completions.create(
        model=settings.llm_model,
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content.strip()
    start = raw.find("[")
    end = raw.rfind("]") + 1
    return json.loads(raw[start:end])
