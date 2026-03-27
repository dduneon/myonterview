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


def _search_company_info(company: str, job_title: str) -> dict:
    """Tavily로 두 가지 쿼리를 실행:
    - 회사 개요: 주요 서비스·사업·기술·문화
    - 직무 정보: 해당 포지션 요건·역할

    Returns:
        {"company": str, "job": str}  — 각 검색 결과 텍스트, 실패 시 빈 문자열
    """
    if not _tavily:
        return {"company": "", "job": ""}

    results = {"company": "", "job": ""}

    # Query 1 — 회사 전반 정보
    try:
        res = _tavily.search(
            query=f"{company} 주요 사업 서비스 기술스택 기업문화 특징",
            max_results=4,
            search_depth="basic",
        )
        results["company"] = "\n".join(
            r.get("content", "") for r in res.get("results", [])
        )[:2000]
    except Exception:
        pass

    # Query 2 — 직무 특화 정보
    try:
        res = _tavily.search(
            query=f"{company} {job_title} 직무 역할 채용 요건 기술",
            max_results=4,
            search_depth="basic",
        )
        results["job"] = "\n".join(
            r.get("content", "") for r in res.get("results", [])
        )[:2000]
    except Exception:
        pass

    return results


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
    interviewer_count: int = 3,
) -> list[dict]:
    """질문 리스트를 생성하고 반환한다.

    Returns:
        [{"text": str, "category": str, "interviewer_id": int}, ...]
    """
    profile = _build_profile(resume_text)
    company_search = _search_company_info(company, job_title)

    # ── 포트폴리오 섹션
    portfolio_section = ""
    if portfolio_text:
        portfolio_section = f"\n\n포트폴리오 요약:\n{portfolio_text[:2000]}"

    # ── 회사 정보 섹션 (Tavily 결과 또는 LLM 자체 지식 활용 안내)
    company_context_section = _build_company_context(
        company=company,
        job_title=job_title,
        company_search=company_search,
    )

    active_personas = {k: v for k, v in INTERVIEWER_PERSONAS.items() if k <= interviewer_count}
    personas_text = "\n".join(
        f"- 면접관 {k}번: {v}" for k, v in active_personas.items()
    )

    prompt = f"""당신은 면접 질문 전문가입니다.

## 지원자 프로필
{json.dumps(profile, ensure_ascii=False, indent=2)}
{portfolio_section}

## 지원 정보
- 회사: {company}
- 직무: {job_title}
- 구분: {interview_type}

{company_context_section}

## 면접관 페르소나
{personas_text}

## 지시사항
위 정보를 바탕으로 면접 질문 12~15개를 생성해줘.

### 카테고리 배분 (반드시 지킬 것):
- **company_specific** 3개 필수: {company} 회사·{job_title} 직무를 직접 연결한 질문
  * 회사 실제 서비스/사업/기술/이슈를 질문에 명시적으로 언급
  * 지원자의 경험·기술과 {company}의 비즈니스를 연결
  * 예시 형태: "{company}의 [구체적 서비스/사업] 에서 {job_title}로서..."
- **intro** 1~2개: 자기소개·지원동기
- **technical** 3~4개: 직무 기술 역량
- **behavioral** 2~3개: 과거 경험 기반
- **situational** 1~2개: 상황 대처
- **closing** 1개: 마무리

### 품질 기준:
- 각 질문은 지원자의 실제 이력서·경험 기반 맞춤형
- company_specific 질문은 반드시 "{company}"를 문장에 포함
- 면접관 {interviewer_count}명에게 균형 배분 (각 페르소나 스타일 반영)
- 한국어로 작성

출력 형식 (JSON 배열만, 설명 없이):
[
  {{"text": "질문 내용", "category": "intro|technical|behavioral|situational|company_specific|closing", "interviewer_id": 1}}
]"""

    response = _llm.chat.completions.create(
        model=settings.llm_model,
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content.strip()
    start = raw.find("[")
    end = raw.rfind("]") + 1
    return json.loads(raw[start:end])


def _build_company_context(company: str, job_title: str, company_search: dict) -> str:
    """Tavily 결과 유무에 따라 회사 컨텍스트 섹션을 구성한다."""
    lines = ["## 회사·직무 컨텍스트"]

    has_company = bool(company_search.get("company", "").strip())
    has_job = bool(company_search.get("job", "").strip())

    if has_company or has_job:
        lines.append("(웹 검색 결과 기반)")
        if has_company:
            lines.append(f"\n### {company} 회사 정보")
            lines.append(company_search["company"])
        if has_job:
            lines.append(f"\n### {company} {job_title} 직무 정보")
            lines.append(company_search["job"])
    else:
        # Tavily 없거나 검색 실패 → LLM 자체 지식 활용 지시
        lines.append(
            f"(웹 검색 결과 없음 — 당신이 알고 있는 {company}에 대한 지식을 적극 활용할 것)"
        )
        lines.append(
            f"\n당신이 알고 있는 {company}의 주요 서비스, 사업 분야, 기술 스택, "
            f"기업 문화, 최근 이슈, {job_title} 포지션의 역할을 바탕으로 "
            f"company_specific 질문을 생성하라. "
            f"정보가 불확실하더라도 {company}의 일반적인 비즈니스 특성과 "
            f"{job_title} 직무를 연결하여 구체적인 질문을 만들어라."
        )

    return "\n".join(lines)
