/**
 * WebSocket 면접 세션 훅
 * - START_INTERVIEW 전송
 * - QUESTION / ANSWER_SAVED / INTERVIEW_DONE / FEEDBACK_PROCESSING 수신
 * - ANSWER_DONE 전송 (오디오 base64 또는 skipped)
 */
import { useEffect, useRef, useCallback } from "react";
import { WS_URL } from "../api/client";
import { useInterviewStore } from "../store/interviewStore";

export function useInterview(sessionId: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const store = useInterviewStore();

  useEffect(() => {
    if (!sessionId) return;

    const socket = new WebSocket(`${WS_URL}/ws/session/${sessionId}`);
    ws.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ event: "START_INTERVIEW", session_id: sessionId }));
    };

    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      switch (msg.event) {
        case "QUESTION":
          store.setCurrentQuestion({
            question_id: msg.question_id,
            text: msg.text,
            audio_url: msg.audio_url,
            interviewer_id: msg.interviewer_id,
            index: msg.index,
            total: msg.total,
          });
          store.setActiveInterviewer(msg.interviewer_id);
          break;

        case "ANSWER_SAVED":
          store.incrementAnswered();
          store.setIsRecording(false);
          break;

        case "INTERVIEW_DONE":
          socket.send(JSON.stringify({ event: "END_INTERVIEW", session_id: sessionId }));
          break;

        case "FEEDBACK_PROCESSING":
          store.setInterviewDone(true);
          store.setCurrentQuestion(null);
          store.setActiveInterviewer(null);
          break;

        case "ERROR":
          console.error("[WS ERROR]", msg.code, msg.message);
          break;
      }
    };

    socket.onerror = (err) => console.error("[WS]", err);

    return () => {
      socket.close();
      ws.current = null;
    };
  }, [sessionId]);

  const sendAnswer = useCallback(
    (questionId: string, audioBytesB64?: string) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
      ws.current.send(
        JSON.stringify({
          event: "ANSWER_DONE",
          question_id: questionId,
          audio_b64: audioBytesB64 ?? "",
          skipped: !audioBytesB64,
        })
      );
    },
    []
  );

  const skipQuestion = useCallback(
    (questionId: string) => {
      sendAnswer(questionId, undefined);
    },
    [sendAnswer]
  );

  return { sendAnswer, skipQuestion };
}
