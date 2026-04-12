"""질문 생성 파이프라인 (OpenAI-compatible API)."""
import json
from typing import Optional

from openai import OpenAI

from app.core.config import get_settings

settings = get_settings()
_llm = OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)

INTERVIEWER_PERSONAS = {
    1: "인사팀 팀장 (40대 여성, 친절하고 체계적, 인성·문화 적합성 중심)",
    2: "개발팀 리드 (30대 남성, 날카롭고 기술적, 실무 능력·문제 해결력 중심)",
    3: "경영진 (50대 남성, 압박 스타일, 논리력·위기 대응력·비전 중심)",
}


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


def _build_company_context(company: str, job_title: str, jd_text: Optional[str]) -> str:
    """JD 텍스트 유무에 따라 회사 컨텍스트 섹션을 구성한다."""
    lines = ["## 회사·직무 컨텍스트"]

    if jd_text and jd_text.strip():
        lines.append("(사용자 제공 채용공고 기반 — 아래 내용을 최우선으로 활용할 것)")
        lines.append(f"\n### {company} 채용공고 / JD")
        lines.append(jd_text[:3000])
    else:
        lines.append(
            f"(채용공고 미제공 — 당신이 알고 있는 {company}에 대한 지식을 적극 활용할 것)"
        )
        lines.append(
            f"\n당신이 알고 있는 {company}의 주요 서비스, 사업 분야, 기술 스택, "
            f"기업 문화, 최근 이슈, {job_title} 포지션의 역할을 바탕으로 "
            f"company_specific 질문을 생성하라. "
            f"정보가 불확실하더라도 {company}의 일반적인 비즈니스 특성과 "
            f"{job_title} 직무를 연결하여 구체적인 질문을 만들어라."
        )

    return "\n".join(lines)


def generate_questions(
    resume_text: str,
    company: str,
    job_title: str,
    interview_type: str = "신입",
    portfolio_text: Optional[str] = None,
    interviewer_count: int = 3,
    jd_text: Optional[str] = None,
) -> list[dict]:
    """질문 리스트를 생성하고 반환한다.

    Returns:
        [{"text": str, "category": str, "interviewer_id": int}, ...]
    """
    profile = _build_profile(resume_text)
    company_context_section = _build_company_context(company, job_title, jd_text)

    portfolio_section = ""
    if portfolio_text:
        portfolio_section = f"\n\n포트폴리오 요약:\n{portfolio_text[:2000]}"

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
  * 채용공고가 제공된 경우 JD의 요구사항·기술스택·업무 내용을 질문에 직접 반영
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
※ category 값은 반드시 소문자: intro / technical / behavioral / situational / company_specific / closing
[
  {{"text": "질문 내용", "category": "company_specific", "interviewer_id": 1}}
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
