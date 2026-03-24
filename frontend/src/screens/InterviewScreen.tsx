/**
 * 메인 면접 화면 (Phase 2 업데이트)
 *
 * 변경 사항:
 *   - avatarState 계산 후 InterviewerTile에 전달
 *     · TTS 재생 중 활성 면접관 → "talking"
 *     · 답변 대기 중 활성 면접관 → "thinking"
 *     · 비활성 면접관            → "idle"
 *   - 기기 성능 분기 (3GB 미만 → 2D)는 그대로 유지
 */
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Alert, Dimensions, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter, useLocalSearchParams } from "expo-router";
import DeviceInfo from "react-native-device-info";

import { useInterviewStore } from "../store/interviewStore";
import { useInterview } from "../hooks/useInterview";
import { useSTT } from "../hooks/useSTT";
import { useLipSync } from "../hooks/useLipSync";
import { AvatarState } from "../hooks/useAvatarAnimation";
import InterviewerTile from "../components/InterviewerTile";
import ControlBar from "../components/ControlBar";

const { width: SW } = Dimensions.get("window");

/**
 * 면접관 ID와 현재 상태를 바탕으로 AvatarState 결정
 * - 활성 면접관이고 TTS가 재생 중이면 "talking"
 * - 활성 면접관이고 사용자가 답변 중(또는 TTS 종료 후)이면 "thinking"
 * - 비활성 면접관은 "idle"
 */
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
  const { sendAnswer, skipQuestion } = useInterview(sessionId);
  const { startRecording, stopRecording, isRecording } = useSTT();
  const { mouthOpen, isPlaying: isTTSPlaying, play: playTTS, stop: stopTTS } = useLipSync();

  // 기기 성능 체크 (3GB 미만 또는 웹 → 2D 폴백)
  useEffect(() => {
    if (Platform.OS === "web") {
      // 웹: GLB 아바타 미지원 → 항상 2D
      setUse3D(false);
    } else {
      DeviceInfo.getTotalMemory().then((bytes) => {
        setUse3D(bytes >= 3 * 1024 * 1024 * 1024);
      });
    }
    requestPermission();
  }, []);

  // 새 질문이 오면 TTS 재생 → 완료 시 자동 녹음 시작
  const currentQuestion = store.currentQuestion;
  useEffect(() => {
    if (!currentQuestion?.audio_url) return;
    playTTS(currentQuestion.audio_url, () => {
      if (isMicOn) startRecording();
    });
  }, [currentQuestion?.question_id]);

  // 면접 종료 → 피드백 화면으로 이동
  useEffect(() => {
    if (store.interviewDone) {
      router.replace({ pathname: "/feedback", params: { sessionId } });
    }
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

      {/* 면접관 그리드 */}
      <View style={styles.interviewersGrid}>
        {([1, 2, 3] as const).map((id) => (
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

      {/* 사용자 카메라 (우측 하단 PiP) */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  progressBadge: {
    position: "absolute",
    top: 56,
    right: 16,
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    zIndex: 10,
  },
  progressText: { color: "#aaa", fontSize: 13, fontWeight: "600" },
  interviewersGrid: {
    flexDirection: "row",
    padding: 12,
    paddingTop: 60,
    flex: 1,
  },
  subtitleBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 12,
    padding: 12,
  },
  subtitleText: { color: "#fff", fontSize: 15, lineHeight: 22, textAlign: "center" },
  selfCamera: {
    position: "absolute",
    bottom: 100,
    right: 16,
    width: 90,
    height: 130,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#333",
  },
});
