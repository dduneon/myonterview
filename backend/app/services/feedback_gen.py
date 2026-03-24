"""피드백 생성 파이프라인 (OpenAI-compatible API)."""
import json

from openai import OpenAI

from app.core.config import get_settings

settings = get_settings()
_llm = OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)


def generate_feedback(
    qa_pairs: list[dict],  # [{"question": str, "answer": str, "category": str}]
    company: str,
    job_title: str,
) -> dict:
    """면접 Q&A를 평가하고 피드백 JSON을 반환한다."""

    qa_text = "\n\n".join(
        f"[{i+1}번 질문 / {p['category']}]\nQ: {p['question']}\nA: {p['answer'] or '(답변 없음 - 건너뜀)'}"
        for i, p in enumerate(qa_pairs)
    )

    prompt = f"""당신은 채용 전문 면접 평가 전문가입니다.

## 지원 정보
- 회사: {company}
- 직무: {job_title}

## 면접 Q&A
{qa_text}

## 평가 기준
1. 답변 구조 (STAR 기법 충족 여부)
2. 구체성 (수치, 근거, 예시 포함 여부)
3. 직무 적합성 (직무·회사 키워드와의 연관도)
4. 커뮤니케이션 (명확성, 간결성, 자신감)

## 지시사항
위 면접 내용을 평가하고 아래 JSON 형식으로 출력해줘.
건너뛴 답변은 해당 항목 점수를 낮게 반영해.
JSON만 출력하고 설명은 생략해.

{{
  "overall_score": 85,
  "category_scores": {{
    "structure": 80,
    "specificity": 90,
    "job_fit": 85,
    "communication": 88
  }},
  "question_reviews": [
    {{"question_id_index": 0, "comment": "...", "score": 88}}
  ],
  "strengths": ["강점1", "강점2", "강점3"],
  "improvements": ["개선점1", "개선점2", "개선점3"]
}}"""

    response = _llm.chat.completions.create(
        model=settings.llm_model,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content.strip()
    start = raw.find("{")
    end = raw.rfind("}") + 1
    return json.loads(raw[start:end])
