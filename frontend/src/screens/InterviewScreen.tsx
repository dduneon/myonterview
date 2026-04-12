/**
 * 메인 면접 화면 — FaceTime 스타일 레이아웃
 *
 * ┌────────────────────────────┬──────────┐
 * │                            │ [thumb2] │
 * │   ACTIVE INTERVIEWER       │ [thumb3] │
 * │   (메인 타일, 전체 높이)    │ [selfcam]│
 * │                            │          │
 * │  [이름 배지 좌하단]         │          │
 * ├────────────────────────────┴──────────┤
 * │  [자막 / 현재 질문]                    │
 * ├────────────────────────────────────────┤
 * │  [컨트롤 바]                           │
 * └────────────────────────────────────────┘
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Alert,
  TouchableOpacity, Modal,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter, useLocalSearchParams } from "expo-router";

import { useInterviewStore } from "../store/interviewStore";
import { useInterview } from "../hooks/useInterview";
import { useSTT } from "../hooks/useSTT";
import { useLipSync } from "../hooks/useLipSync";
import { useRecording } from "../hooks/useRecording";
import { AvatarState } from "../hooks/useAvatarAnimation";
import InterviewerTile from "../components/InterviewerTile";
import ControlBar from "../components/ControlBar";
import { uploadRecording } from "../api/client";

function getAvatarState(
  interviewerId: number,
  activeId: number | null,
  isTTSPlaying: boolean,
  isRecording: boolean
): AvatarState {
  if (interviewerId !== activeId) return "idle";
  if (isTTSPlaying) return "talking";
  if (isRecording) return "thinking";
  return "idle";
}

export default function InterviewScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);

  const store = useInterviewStore();
  const { sendAnswer, skipQuestion, wsConnected } = useInterview(sessionId);
  const { startRecording, stopRecording, isRecording } = useSTT();
  const { mouthOpen, isPlaying: isTTSPlaying, play: playTTS, stop: stopTTS } = useLipSync();
  const { startRecording: startVideoRec, stopRecording: stopVideoRec } = useRecording();

  // 면접관 수 기반 타일 ID 목록
  const interviewerCount = store.session?.interviewer_count ?? 3;
  const interviewerIds = Array.from({ length: interviewerCount }, (_, i) => (i + 1) as 1 | 2 | 3);

  useEffect(() => {
    requestPermission();
    startVideoRec();
  }, []);

  // 새 질문 → TTS 재생 → 완료 시 자동 녹음 시작
  const currentQuestion = store.currentQuestion;
  useEffect(() => {
    if (!currentQuestion?.audio_url) return;
    playTTS(currentQuestion.audio_url, () => {
      if (isMicOn) startRecording();
    });
  }, [currentQuestion?.question_id]);

  // 면접 종료 → 녹화 업로드 → 피드백 화면 이동
  useEffect(() => {
    if (!store.interviewDone) return;
    (async () => {
      try {
        const blob = await stopVideoRec();
        if (blob && sessionId) {
          const url = await uploadRecording(sessionId, blob);
          store.setRecordingUrl(url);
        }
      } catch {
        // 녹화 업로드 실패 무시 — 피드백은 정상 진행
      }
      router.replace({ pathname: "/feedback", params: { sessionId } });
    })();
  }, [store.interviewDone]);

  const handleDone = useCallback(async () => {
    if (!currentQuestion) return;
    if (!isRecording) {
      await startRecording();
      store.setIsRecording(true);
      return;
    }
    store.setIsRecording(false);
    await stopTTS();
    const base64 = await stopRecording();
    if (base64) sendAnswer(currentQuestion.question_id, base64);
  }, [currentQuestion, isRecording]);

  const handleSkip = useCallback(async () => {
    if (!currentQuestion) return;
    await stopTTS();
    if (isRecording) await stopRecording();
    store.setIsRecording(false);
    skipQuestion(currentQuestion.question_id);
  }, [currentQuestion, isRecording]);

  const handleEnd = useCallback(() => {
    Alert.alert(
      "면접 종료",
      "종료하시겠습니까? 지금까지의 답변으로 피드백이 생성됩니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "종료",
          style: "destructive",
          onPress: async () => {
            await stopTTS();
            if (isRecording) await stopRecording();
            store.setInterviewDone(true);
          },
        },
      ]
    );
  }, [isRecording]);

  const activeId = store.activeInterviewerId;
  const wsError = store.wsError;

  // FaceTime 레이아웃: 활성 면접관 → 메인, 나머지 → 썸네일
  const mainId = activeId ?? interviewerIds[0];
  const thumbIds = interviewerIds.filter((id) => id !== mainId);

  return (
    <View style={styles.container}>

      {/* ── 영상 영역 ── */}
      <View style={styles.videoArea}>

        {/* 메인 타일 — 발화 중인 면접관 전체 화면 */}
        <InterviewerTile
          interviewerId={mainId}
          isActive={activeId === mainId}
          avatarState={getAvatarState(mainId, activeId, isTTSPlaying, isRecording)}
          mouthOpen={mouthOpen}
          size="main"
        />

        {/* 우측 썸네일 컬럼 */}
        <View style={styles.thumbColumn}>
          {thumbIds.map((id) => (
            <InterviewerTile
              key={id}
              interviewerId={id}
              isActive={activeId === id}
              avatarState={getAvatarState(id, activeId, isTTSPlaying, isRecording)}
              mouthOpen={mouthOpen}
              size="thumb"
            />
          ))}

          {/* 자기 카메라 PiP — 썸네일 아래 */}
          {isCamOn && permission?.granted && (
            <View style={styles.selfCamera}>
              <CameraView style={StyleSheet.absoluteFill} facing="front" />
              <Text style={styles.selfLabel}>나</Text>
            </View>
          )}
        </View>

        {/* 진행률 배지 — 메인 타일 우상단 */}
        {currentQuestion && (
          <View style={styles.progressBadge}>
            <Text style={styles.progressText}>
              Q{currentQuestion.index} / {currentQuestion.total}
            </Text>
          </View>
        )}

        {/* 재연결 중 배지 */}
        {!wsConnected && !wsError && (
          <View style={styles.connectingBadge}>
            <Text style={styles.connectingText}>🔄 연결 중...</Text>
          </View>
        )}
      </View>

      {/* ── 자막 ── */}
      {currentQuestion && (
        <View style={styles.subtitleBox}>
          <Text style={styles.subtitleText} numberOfLines={3}>
            {currentQuestion.text}
          </Text>
        </View>
      )}

      {/* ── 컨트롤 바 ── */}
      <ControlBar
        isRecording={isRecording}
        isMicOn={isMicOn}
        isCamOn={isCamOn}
        onToggleMic={() => setIsMicOn((v) => !v)}
        onToggleCam={() => setIsCamOn((v) => !v)}
        onDone={handleDone}
        onSkip={handleSkip}
        onEnd={handleEnd}
      />

      {/* ── WS 에러 모달 ── */}
      <Modal visible={!!wsError} transparent animationType="fade">
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>연결이 끊어졌습니다</Text>
            <Text style={styles.errorMsg}>{wsError}</Text>
            <TouchableOpacity
              style={styles.errorBtn}
              onPress={() => {
                store.setWsError(null);
                router.replace("/");
              }}
            >
              <Text style={styles.errorBtnText}>처음으로</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  // ── 영상 영역
  videoArea: {
    flex: 1,
    flexDirection: "row",
    padding: 8,
    gap: 8,
  },

  // ── 우측 썸네일 컬럼
  thumbColumn: {
    width: 116,
    flexDirection: "column",
    gap: 8,
  },

  // ── 자기 카메라 PiP
  selfCamera: {
    width: 108,
    height: 140,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#333",
    position: "relative",
  },
  selfLabel: {
    position: "absolute",
    bottom: 6,
    left: 8,
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // ── 오버레이 배지
  progressBadge: {
    position: "absolute",
    top: 20,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  progressText: { color: "#ddd", fontSize: 13, fontWeight: "600" },

  connectingBadge: {
    position: "absolute",
    top: 20,
    right: 132, // 썸네일 컬럼 왼쪽
    backgroundColor: "rgba(15,15,40,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  connectingText: { color: "#818cf8", fontSize: 12 },

  // ── 자막
  subtitleBox: {
    marginHorizontal: 12,
    marginBottom: 6,
    backgroundColor: "rgba(10,10,10,0.85)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
  },
  subtitleText: {
    color: "#f0f0f0",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },

  // ── WS 에러 모달
  errorOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    padding: 32,
    width: "80%",
    alignItems: "center",
  },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorTitle: { fontSize: 18, color: "#fff", fontWeight: "700", marginBottom: 8 },
  errorMsg: { fontSize: 14, color: "#888", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  errorBtn: {
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  errorBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
