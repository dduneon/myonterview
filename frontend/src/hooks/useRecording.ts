/**
 * 면접 녹화 훅
 * - 웹: MediaRecorder API (카메라 + 마이크 → video/webm)
 * - 네이티브: 미지원 (Phase 4 예정)
 */
import { useRef, useState, useCallback } from "react";
import { Platform } from "react-native";

export function useRecording() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);

  const startRecording = useCallback(async () => {
    if (Platform.OS !== "web") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      // 권한 거부 또는 미지원 — 녹화 없이 계속 진행
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (Platform.OS !== "web") return null;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return null;

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordingBlob(blob);
        setIsRecording(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  /** 브라우저 로컬 다운로드 */
  const downloadRecording = useCallback(
    (sessionId: string) => {
      if (!recordingBlob || Platform.OS !== "web") return;
      const url = URL.createObjectURL(recordingBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `interview_${sessionId}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [recordingBlob]
  );

  return { startRecording, stopRecording, downloadRecording, isRecording, recordingBlob };
}
