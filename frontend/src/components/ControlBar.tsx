/**
 * 면접 화면 하단 컨트롤 바
 * - 마이크 ON/OFF, 카메라 ON/OFF
 * - 완료(답변 제출), 건너뛰기, 종료
 */
import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";

interface Props {
  isRecording: boolean;
  isMicOn: boolean;
  isCamOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onDone: () => void;
  onSkip: () => void;
  onEnd: () => void;
}

export default function ControlBar({
  isRecording,
  isMicOn,
  isCamOn,
  onToggleMic,
  onToggleCam,
  onDone,
  onSkip,
  onEnd,
}: Props) {
  return (
    <View style={styles.container}>
      {/* 왼쪽: 마이크·카메라 */}
      <View style={styles.left}>
        <TouchableOpacity
          style={[styles.iconBtn, !isMicOn && styles.iconBtnOff]}
          onPress={onToggleMic}
        >
          <Text style={styles.icon}>{isMicOn ? "🎙️" : "🔇"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, !isCamOn && styles.iconBtnOff]}
          onPress={onToggleCam}
        >
          <Text style={styles.icon}>{isCamOn ? "📷" : "📵"}</Text>
        </TouchableOpacity>
      </View>

      {/* 가운데: 완료 버튼 */}
      <TouchableOpacity
        style={[styles.doneBtn, isRecording && styles.doneBtnActive]}
        onPress={onDone}
      >
        <Text style={styles.doneBtnText}>
          {isRecording ? "● 답변 완료" : "답변 시작"}
        </Text>
      </TouchableOpacity>

      {/* 오른쪽: 건너뛰기·종료 */}
      <View style={styles.right}>
        <TouchableOpacity style={styles.textBtn} onPress={onSkip}>
          <Text style={styles.textBtnText}>건너뛰기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.endBtn} onPress={onEnd}>
          <Text style={styles.endBtnText}>종료</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#111",
    borderTopWidth: 1,
    borderTopColor: "#222",
  },
  left: { flexDirection: "row", gap: 10 },
  right: { flexDirection: "row", gap: 10, alignItems: "center" },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnOff: { backgroundColor: "#4a1a1a" },
  icon: { fontSize: 20 },
  doneBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#2a2a2a",
    borderWidth: 2,
    borderColor: "#3a3a3a",
  },
  doneBtnActive: { backgroundColor: "#7c3aed", borderColor: "#7c3aed" },
  doneBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  textBtn: { padding: 8 },
  textBtnText: { color: "#666", fontSize: 13 },
  endBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#4a1a1a",
  },
  endBtnText: { color: "#f87171", fontSize: 13, fontWeight: "600" },
});
