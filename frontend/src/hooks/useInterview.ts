/**
 * WebSocket 면접 세션 훅
 * - 자동 재연결 (최대 3회, 지수 백오프: 2s → 4s → 8s)
 * - START_INTERVIEW 전송 (재연결 시 서버가 이어서 진행)
 * - QUESTION / ANSWER_SAVED / INTERVIEW_DONE / FEEDBACK_PROCESSING 수신
 * - ANSWER_DONE 전송 (오디오 base64 또는 skipped)
 */
import { useEffect, useRef, useCallback, useState } from "react";
import { WS_URL } from "../api/client";
import { useInterviewStore } from "../store/interviewStore";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];

export function useInterview(sessionId: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const store = useInterviewStore();
  const [wsConnected, setWsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!sessionId) return;

    const socket = new WebSocket(`${WS_URL}/ws/session/${sessionId}`);
    ws.current = socket;

    socket.onopen = () => {
      retryCount.current = 0;
      setWsConnected(true);
      store.setWsError(null);
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
          if (msg.code === "SESSION_NOT_READY") {
            store.setWsError("세션이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
          }
          break;
      }
    };

    socket.onerror = () => {
      setWsConnected(false);
    };

    socket.onclose = () => {
      setWsConnected(false);
      ws.current = null;

      // 면접 완료 후 또는 에러 표시 후에는 재연결 안 함
      if (store.interviewDone) return;
      if (store.wsError) return;
      if (retryCount.current >= MAX_RETRIES) {
        store.setWsError("서버 연결이 끊어졌습니다. 새로고침 후 다시 시도해주세요.");
        return;
      }

      const delay = RETRY_DELAYS[retryCount.current] ?? 8000;
      retryCount.current += 1;
      retryTimer.current = setTimeout(connect, delay);
    };
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => {
      retryTimer.current && clearTimeout(retryTimer.current);
      ws.current?.close();
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
    (questionId: string) => sendAnswer(questionId, undefined),
    [sendAnswer]
  );

  return { sendAnswer, skipQuestion, wsConnected };
}
