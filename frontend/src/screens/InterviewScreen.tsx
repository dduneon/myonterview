/**
 * 메인 면접 화면 (Phase 3 업데이트)
 *
 * - 면접관 수 (session.interviewer_count) 기반 동적 타일 렌더링
 * - WS 에러 모달 (재연결 실패 시)
 * - 연결 중 배지 (재연결 시도 중)
 * - 면접 녹화 (웹 MediaRecorder) → 종료 시 MinIO 업로드
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Alert, Dimensions,
  Platform, TouchableOpacity, Modal,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter, useLocalSearchParams } from "expo-router";
import DeviceInfo from "react-native-device-info";

import { useInterviewStore } from "../store/interviewStore";
import { useInterview } from "../hooks/useInterview";
import { useSTT } from "../hooks/useSTT";
import { useLipSync } from "../hooks/useLipSync";
import { useRecording } from "../hooks/useRecording";
import { AvatarState } from "../hooks/useAvatarAnimation";
import InterviewerTile from "../components/InterviewerTile";
import ControlBar from "../components/ControlBar";
import { uploadRecording } from "../api/client";

const { width: SW } = Dimensions.get("window");

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
  const [use3D, setUse3D] = useState(false);

  const store = useInterviewStore();
  const { sendAnswer, skipQuestion, wsConnected } = useInterview(sessionId);
  const { startRecording, stopRecording, isRecording } = useSTT();
  const { mouthOpen, isPlaying: isTTSPlaying, play: playTTS, stop: stopTTS } = useLipSync();
  const { startRecording: startVideoRec, stopRecording: stopVideoRec } = useRecording();

  // 면접관 수 기반 타일 ID 목록
  const interviewerCount = store.session?.interviewer_count ?? 3;
  const interviewerIds = Array.from({ length: interviewerCount }, (_, i) => (i + 1) as 1 | 2 | 3);

  useEffect(() => {
    if (Platform.OS === "web") {
      setUse3D(false);
    } else {
      DeviceInfo.getTotalMemory().then((bytes) => {
        setUse3D(bytes >= 3 * 1024 * 1024 * 1024);
      });
    }
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

  return (
    <View style={styles.container}>
      {/* 진행률 */}
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

      {/* 면접관 그리드 */}
      <View style={[
        styles.interviewersGrid,
        interviewerCount === 1 && styles.gridSingle,
        interviewerCount === 2 && styles.gridDouble,
      ]}>
        {interviewerIds.map((id) => (
          <InterviewerTile
            key={id}
            interviewerId={id}
            isActive={activeId === id}
            avatarState={getAvatarState(id, activeId, isTTSPlaying, isRecording)}
            mouthOpen={mouthOpen}
            use3D={use3D}
          />
        ))}
      </View>

      {/* 현재 질문 자막 */}
      {currentQuestion && (
        <View style={styles.subtitleBox}>
          <Text style={styles.subtitleText}>{currentQuestion.text}</Text>
        </View>
      )}

      {/* 사용자 카메라 PiP */}
      {isCamOn && permission?.granted && (
        <View style={styles.selfCamera}>
          <CameraView style={StyleSheet.absoluteFill} facing="front" />
        </View>
      )}

      {/* 하단 컨트롤 바 */}
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

      {/* WS 에러 모달 */}
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
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  progressBadge: {
    position: "absolute", top: 56, right: 16,
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, zIndex: 10,
  },
  progressText: { color: "#aaa", fontSize: 13, fontWeight: "600" },
  connectingBadge: {
    position: "absolute", top: 56, left: 16,
    backgroundColor: "#1a1a2e",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, zIndex: 10,
  },
  connectingText: { color: "#818cf8", fontSize: 12 },
  interviewersGrid: {
    flexDirection: "row", padding: 12, paddingTop: 60, flex: 1,
  },
  gridSingle: { justifyContent: "center" },
  gridDouble: { justifyContent: "space-evenly" },
  subtitleBox: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 12, padding: 12,
  },
  subtitleText: { color: "#fff", fontSize: 15, lineHeight: 22, textAlign: "center" },
  selfCamera: {
    position: "absolute", bottom: 100, right: 16,
    width: 90, height: 130,
    borderRadius: 12, overflow: "hidden",
    borderWidth: 2, borderColor: "#333",
  },
  errorOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center", justifyContent: "center",
  },
  errorCard: {
    backgroundColor: "#1a1a1a", borderRadius: 20,
    padding: 32, width: "80%", alignItems: "center",
  },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorTitle: { fontSize: 18, color: "#fff", fontWeight: "700", marginBottom: 8 },
  errorMsg: { fontSize: 14, color: "#888", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  errorBtn: { backgroundColor: "#4f46e5", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  errorBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
