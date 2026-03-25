# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 서비스 개요

**면터뷰(myonterview)** — AI 기반 모의 면접 서비스.
이력서·포트폴리오·지원 회사 정보를 기반으로 AI 면접관 3명이 화상 통화 UI에서 맞춤 질문을 제공하고, 종료 후 상세 피드백 리포트를 생성한다.

---

## 실행 명령어

### 백엔드 (Docker — 권장)

```bash
cd backend
docker compose up -d          # 전체 스택 기동 (최초 kokoro 모델 다운로드 ~300MB)
docker compose up -d --build  # 코드 변경 후 재빌드
docker compose logs -f api    # API 로그
docker compose logs -f kokoro # TTS 서버 로그 (최초 모델 로딩 확인용)
```

### 백엔드 (로컬 직접 실행)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
celery -A app.tasks.celery_tasks worker --loglevel=info  # 별도 터미널
```

### 프론트엔드

```bash
cd frontend
npm install
npx expo start --web    # 브라우저 테스트 (localhost:8081)
npx expo start --ios    # iOS 시뮬레이터 (Xcode 필요)
```

---

## 아키텍처

### 전체 데이터 흐름

```
SetupScreen → POST /api/session (resume 파일 업로드)
            → Celery: task_generate_questions (LLM + Tavily)
LoadingScreen → GET /api/session/{id} polling → status: QUESTIONS_READY
InterviewScreen → WS /ws/session/{id}
  서버: QUESTION 이벤트 (audio_url + 질문 텍스트 + interviewer_id)
  클라: 녹음 → ANSWER_DONE (base64 오디오)
  서버: Whisper STT → DB 저장 → 다음 QUESTION
        마지막 답변 후 → Celery: task_generate_feedback
FeedbackScreen → GET /api/feedback/{id} (202 polling → 200)
```

### 백엔드 핵심 구조

- **`app/main.py`** — FastAPI 진입점, CORS, DB init, WebSocket 라우터
- **`app/core/config.py`** — Pydantic Settings, `extra = "ignore"` (Docker 전용 env 무시)
- **`app/core/storage.py`** — S3-compatible 업로드 (MinIO/R2/AWS 교체 가능)
- **`app/ws/interview.py`** — WebSocket 이벤트 루프 (면접 진행의 핵심)
- **`app/tasks/celery_tasks.py`** — 동기 SQLAlchemy 사용 (asyncpg와 혼용 불가)

### 프론트엔드 핵심 구조

- **`src/store/interviewStore.ts`** — Zustand. `session`, `currentQuestion`, `activeInterviewerId`, `mouthOpen` 등 면접 상태 전체 관리
- **`src/hooks/useInterview.ts`** — WebSocket 연결 및 이벤트 dispatch
- **`src/hooks/useLipSync.ts`** — TTS 오디오 재생 + expo-av metering → `mouthOpen` (0–1)
- **`src/components/InterviewerTile.tsx`** — RAM 3GB 기준으로 3D/2D 자동 분기
- **`src/components/AvatarCanvas.tsx`** — Three.js GLB 렌더러 + 립싱크 morph target

### 외부 서비스 연결

| 역할 | 서비스 | 설정 env |
|---|---|---|
| LLM (질문/피드백) | OpenAI-compatible | `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` |
| STT | OpenAI Whisper (Groq 등) | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_STT_MODEL` |
| TTS | Kokoro (로컬 Docker) | `KOKORO_URL` (기본: `http://kokoro:8880`) |
| Storage | MinIO/S3-compatible | `AWS_S3_ENDPOINT_URL` (내부), `AWS_S3_PUBLIC_URL` (브라우저용) |
| 회사 검색 | Tavily (선택) | `TAVILY_API_KEY` (없으면 검색 스킵) |

> **중요:** `AWS_S3_ENDPOINT_URL`은 컨테이너 내부 업로드용 (`http://minio:9000`), `AWS_S3_PUBLIC_URL`은 브라우저 접근용 (`http://localhost:9000`). 두 값이 달라야 한다.

---

## WebSocket 이벤트 명세

| 이벤트 | 방향 | 주요 페이로드 |
|---|---|---|
| `START_INTERVIEW` | 클라→서버 | `{session_id}` |
| `QUESTION` | 서버→클라 | `{question_id, text, audio_url, interviewer_id, index, total}` |
| `ANSWER_DONE` | 클라→서버 | `{question_id, audio_b64, skipped}` |
| `ANSWER_SAVED` | 서버→클라 | `{question_id, transcript}` |
| `INTERVIEW_DONE` | 서버→클라 | `{}` |
| `END_INTERVIEW` | 클라→서버 | `{session_id}` |
| `ERROR` | 서버→클라 | `{code, message}` |

---

## 세션 상태 전이

```
PENDING → QUESTIONS_READY → IN_PROGRESS → COMPLETED
                                        → FAILED
```

- `PENDING`: 세션 생성 직후, Celery 작업 대기
- `QUESTIONS_READY`: 질문 생성 완료, 면접 시작 가능
- `IN_PROGRESS`: WebSocket 연결 후
- `COMPLETED`: 피드백 생성 완료

---

## Docker 서비스 구성

| 서비스 | 포트 | 역할 |
|---|---|---|
| api | 8000 | FastAPI |
| worker | — | Celery (질문/피드백 비동기 생성) |
| db | 5432 | PostgreSQL 16 |
| redis | 6379 | Celery 브로커 + TTS 캐시 |
| minio | 9000 / 9001 | S3 스토리지 (콘솔: localhost:9001) |
| kokoro | 8880 | Kokoro TTS (`/v1/audio/speech`) |

---

## 주요 설계 결정 및 제약

- **Celery 태스크는 동기 SQLAlchemy** 사용 — `asyncpg`와 혼용 불가. `celery_tasks.py`에서 `create_engine` (sync) 별도 사용
- **LLM/STT 분리** — `LLM_*` 환경변수(질문/피드백)와 `OPENAI_*`(Whisper STT)는 서로 다른 provider를 쓸 수 있음
- **저사양 기기 분기** — `InterviewerTile`은 RAM 3GB 미만이거나 웹 플랫폼이면 3D 대신 2D 이미지 + SVG 마우스 오버레이로 자동 폴백
- **GLB 캐싱** — `avatarCache.ts`에서 S3 URL → 로컬 파일시스템 캐싱 (재다운로드 방지)
- **TTS 캐싱** — `text+voice+speed` MD5 hash를 Redis key로 24h 캐싱, 동일 질문 재생 시 S3 URL 즉시 반환
- **웹 플랫폼 주의** — `expo-file-system`은 웹 미지원. 오디오 base64 변환 시 플랫폼 분기 필요 (`Platform.OS === 'web'`)

---

## 개발 로드맵 현황

| Phase | 상태 | 내용 |
|---|---|---|
| Phase 1 | ✅ | 기본 플로우 (세션, 질문, TTS/STT, 피드백) |
| Phase 2 | ✅ | 3D 아바타 구조, 립싱크, 저사양 분기 |
| Phase 3 | 🔲 | 에러 핸들링, 면접관 수 선택, 녹화 저장, 성능 최적화 |
| Phase 4 | 🔲 | 면접 스타일 선택, 결제 연동 |
