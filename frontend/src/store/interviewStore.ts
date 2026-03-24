import { create } from "zustand";
import { FeedbackResponse, QuestionOut, SessionResponse } from "../api/client";

interface WSQuestion {
  question_id: string;
  text: string;
  audio_url: string;
  interviewer_id: number;
  index: number;
  total: number;
}

interface InterviewStore {
  // 세션
  session: SessionResponse | null;
  setSession: (s: SessionResponse) => void;
  clearSession: () => void;

  // 질문 진행
  currentQuestion: WSQuestion | null;
  setCurrentQuestion: (q: WSQuestion | null) => void;
  answeredCount: number;
  incrementAnswered: () => void;

  // 활성 면접관 (립싱크/하이라이트용)
  activeInterviewerId: number | null;
  setActiveInterviewer: (id: number | null) => void;

  // 녹음 상태
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;

  // 피드백
  feedback: FeedbackResponse | null;
  setFeedback: (f: FeedbackResponse) => void;

  // 면접 종료 여부
  interviewDone: boolean;
  setInterviewDone: (v: boolean) => void;
}

export const useInterviewStore = create<InterviewStore>((set) => ({
  session: null,
  setSession: (s) => set({ session: s }),
  clearSession: () =>
    set({
      session: null,
      currentQuestion: null,
      answeredCount: 0,
      activeInterviewerId: null,
      isRecording: false,
      feedback: null,
      interviewDone: false,
    }),

  currentQuestion: null,
  setCurrentQuestion: (q) => set({ currentQuestion: q }),
  answeredCount: 0,
  incrementAnswered: () => set((s) => ({ answeredCount: s.answeredCount + 1 })),

  activeInterviewerId: null,
  setActiveInterviewer: (id) => set({ activeInterviewerId: id }),

  isRecording: false,
  setIsRecording: (v) => set({ isRecording: v }),

  feedback: null,
  setFeedback: (f) => set({ feedback: f }),

  interviewDone: false,
  setInterviewDone: (v) => set({ interviewDone: v }),
}));
