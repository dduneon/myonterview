import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
});

export const WS_URL = BASE_URL.replace(/^http/, "ws");

// ── 타입 정의 ─────────────────────────────────────────────────

export interface SessionResponse {
  id: string;
  status: "pending" | "questions_ready" | "in_progress" | "completed" | "failed";
  company: string;
  job_title: string;
  interviewer_count: number;
  recording_url: string | null;
}

export interface QuestionOut {
  id: string;
  text: string;
  audio_url: string | null;
  interviewer_id: number;
  order_index: number;
  category: string;
}

export interface QuestionFeedback {
  question_id_index: number;
  score: number;
  comment: string;
  good_points: string | null;
  better_answer: string | null;
  question: string;       // 질문 텍스트
  answer: string;         // STT 답변 텍스트
  category: string;
}

export interface FeedbackResponse {
  session_id: string;
  overall_score: number;
  structure_score: number;
  specificity_score: number;
  job_fit_score: number;
  communication_score: number;
  strengths: string[];
  improvements: string[];
  question_feedbacks: QuestionFeedback[];
}

// ── API 함수 ──────────────────────────────────────────────────

type FileField =
  | File
  | { uri: string; name: string; type: string };

export async function createSession(form: {
  company: string;
  job_title: string;
  interview_type: string;
  duration_minutes: number;
  interviewer_count: number;
  resume_file: FileField;
  portfolio_file?: FileField | null;
  portfolio_url?: string;
  jd_text?: string;
}): Promise<SessionResponse> {
  const data = new FormData();
  data.append("company", form.company);
  data.append("job_title", form.job_title);
  data.append("interview_type", form.interview_type);
  data.append("duration_minutes", String(form.duration_minutes));
  data.append("interviewer_count", String(form.interviewer_count));
  data.append("resume_file", form.resume_file as any);
  if (form.portfolio_file) data.append("portfolio_file", form.portfolio_file as any);
  if (form.portfolio_url) data.append("portfolio_url", form.portfolio_url);
  if (form.jd_text) data.append("jd_text", form.jd_text);

  const res = await api.post<SessionResponse>("/api/session", data, {
    headers: typeof document !== "undefined" ? {} : { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function getSession(sessionId: string): Promise<SessionResponse> {
  const res = await api.get<SessionResponse>(`/api/session/${sessionId}`);
  return res.data;
}

export async function getFeedback(sessionId: string): Promise<FeedbackResponse> {
  // validateStatus: 200만 성공으로 처리 — 202(생성 중)는 에러로 throw해서 polling 유지
  const res = await api.get<FeedbackResponse>(`/api/feedback/${sessionId}`, {
    validateStatus: (status) => status === 200,
  });
  return res.data;
}

export async function uploadRecording(sessionId: string, blob: Blob): Promise<string> {
  const data = new FormData();
  data.append("recording", blob, `interview_${sessionId}.webm`);
  const res = await api.post<{ recording_url: string }>(
    `/api/session/${sessionId}/recording`,
    data,
    { headers: {}, timeout: 120_000 }
  );
  return res.data.recording_url;
}
