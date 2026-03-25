import { create } from "zustand";
import { FeedbackResponse, QuestionOut, SessionResponse } from "../api/client";

interface WSQuestion {
  question_id: string;
  text: string;
  audio_url: string | null;
  interviewer_id: number;
  index: number;
  total: number;
}

interface InterviewStore {
  session: SessionResponse | null;
  setSession: (s: SessionResponse) => void;
  clearSession: () => void;

  currentQuestion: WSQuestion | null;
  setCurrentQuestion: (q: WSQuestion | null) => void;
  answeredCount: number;
  incrementAnswered: () => void;

  activeInterviewerId: number | null;
  setActiveInterviewer: (id: number | null) => void;

  isRecording: boolean;
  setIsRecording: (v: boolean) => void;

  feedback: FeedbackResponse | null;
  setFeedback: (f: FeedbackResponse) => void;

  interviewDone: boolean;
  setInterviewDone: (v: boolean) => void;

  wsError: string | null;
  setWsError: (msg: string | null) => void;

  recordingUrl: string | null;
  setRecordingUrl: (url: string | null) => void;
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
      wsError: null,
      recordingUrl: null,
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

  wsError: null,
  setWsError: (msg) => set({ wsError: msg }),

  recordingUrl: null,
  setRecordingUrl: (url) => set({ recordingUrl: url }),
}));
