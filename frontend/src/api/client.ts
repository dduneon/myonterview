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
}

export interface QuestionOut {
  id: string;
  text: string;
  audio_url: string | null;
  interviewer_id: number;
  order_index: number;
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
  question_feedbacks: { question_id_index: number; comment: string; score: number }[];
}

// ── API 함수 ──────────────────────────────────────────────────

type FileField =
  | File                                      // 웹: 실제 File 객체
  | { uri: string; name: string; type: string }; // 네이티브: RN 파일 객체

export async function createSession(form: {
  company: string;
  job_title: string;
  interview_type: string;
  duration_minutes: number;
  resume_file: FileField;
  portfolio_file?: FileField | null;
  portfolio_url?: string;
}): Promise<SessionResponse> {
  const data = new FormData();
  data.append("company", form.company);
  data.append("job_title", form.job_title);
  data.append("interview_type", form.interview_type);
  data.append("duration_minutes", String(form.duration_minutes));
  data.append("resume_file", form.resume_file as any);
  if (form.portfolio_file) data.append("portfolio_file", form.portfolio_file as any);
  if (form.portfolio_url) data.append("portfolio_url", form.portfolio_url);

  const res = await api.post<SessionResponse>("/api/session", data, {
    // 웹에서는 Content-Type 헤더를 직접 지정하지 않아야
    // axios/fetch가 boundary를 자동으로 설정함
    headers: typeof document !== "undefined" ? {} : { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function getSession(sessionId: string): Promise<SessionResponse> {
  const res = await api.get<SessionResponse>(`/api/session/${sessionId}`);
  return res.data;
}

export async function getFeedback(sessionId: string): Promise<FeedbackResponse> {
  const res = await api.get<FeedbackResponse>(`/api/feedback/${sessionId}`);
  return res.data;
}
