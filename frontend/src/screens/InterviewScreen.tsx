/**
 * 메인 면접 화면
 * - Facetime 레이아웃: 면접관 3명 (상단 그리드) + 사용자 카메라 (우측 하단)
 * - WebSocket으로 질문 수신 → TTS 재생 + 립싱크
 * - STT 녹음 → 답변 제출
 * - 저사양 기기: 2D 타일 / 고사양: Three.js (Phase 2)
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Alert, Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter, useLocalSearchParams } from "expo-router";
import DeviceInfo from "react-native-device-info";

import { useInterviewStore } from "../store/interviewStore";
import { useInterview } from "../hooks/useInterview";
import { useSTT } from "../hooks/useSTT";
import { useLipSync } from "../hooks/useLipSync";
import InterviewerTile from "../components/InterviewerTile";
import ControlBar from "../components/ControlBar";

const { width: SW } = Dimensions.get("window");

export default function InterviewScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [use3D, setUse3D] = useState(false);  // Phase 2에서 true로 전환

  const store = useInterviewStore();
  const { sendAnswer, skipQuestion } = useInterview(sessionId);
  const { startRecording, stopRecording, isRecording } = useSTT();
  const { mouthOpen, play: playTTS, stop: stopTTS } = useLipSync();

  // 기기 성능 체크 (3GB 미만 → 2D 폴백)
  useEffect(() => {
    DeviceInfo.getTotalMemory().then((bytes) => {
      setUse3D(bytes >= 3 * 1024 * 1024 * 1024);
    });
    requestPermission();
  }, []);

  // 새 질문이 오면 TTS 재생
  const currentQuestion = store.currentQuestion;
  useEffect(() => {
    if (!currentQuestion?.audio_url) return;
    playTTS(currentQuestion.audio_url, () => {
      // TTS 재생 완료 → 자동 녹음 시작
      if (isMicOn) startRecording();
    });
  }, [currentQuestion?.question_id]);

  // 면접 종료 → 피드백 화면으로
  useEffect(() => {
    if (store.interviewDone) {
      router.replace({ pathname: "/feedback", params: { sessionId } });
    }
  }, [store.interviewDone]);

  const handleDone = useCallback(async () => {
    if (!currentQuestion) return;

    if (!isRecording) {
      // 녹음 시작
      await startRecording();
      store.setIsRecording(true);
      return;
    }

    // 녹음 중지 → 제출
    store.setIsRecording(false);
    await stopTTS();
    const base64 = await stopRecording();
    if (base64) {
      sendAnswer(currentQuestion.question_id, base64);
    }
  }, [currentQuestion, isRecording]);

  const handleSkip = useCallback(async () => {
    if (!currentQuestion) return;
    await stopTTS();
    if (isRecording) await stopRecording();
    store.setIsRecording(false);
    skipQuestion(currentQuestion.question_id);
  }, [currentQuestion, isRecording]);

  const handleEnd = useCallback(() => {
    Alert.alert("면접 종료", "면접을 종료하시겠습니까? 지금까지의 답변으로 피드백이 생성됩니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "종료",
        style: "destructive",
        onPress: async () => {
          await stopTTS();
          if (isRecording) await stopRecording();
          // WebSocket END_INTERVIEW는 useInterview 내부에서 INTERVIEW_DONE 이후 자동 전송
          // 직접 종료 시에는 interviewDone을 강제 세팅
          store.setInterviewDone(true);
        },
      },
    ]);
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

      {/* 면접관 그리드 (상단) */}
      <View style={styles.interviewersGrid}>
        {[1, 2, 3].map((id) => (
          <InterviewerTile
            key={id}
            interviewerId={id}
            isActive={activeId === id}
            mouthOpen={activeId === id ? mouthOpen : 0}
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

      {/* 사용자 카메라 (우측 하단) */}
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
    backgroundColor: "rgba(0,0,0,0.7)",
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
