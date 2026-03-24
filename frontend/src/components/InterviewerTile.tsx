/**
 * 면접관 타일 컴포넌트
 * - 3D 고사양: AvatarCanvas (Three.js)
 * - 저사양 폴백: 2D 이미지 + CSS 립싱크 애니메이션
 */
import React from "react";
import { View, Text, Image, StyleSheet, Animated } from "react-native";

interface Props {
  interviewerId: number;
  isActive: boolean;
  mouthOpen: number;         // 0~1 (활성 면접관일 때만 의미 있음)
  use3D: boolean;
  avatarImageUri?: string;   // 2D 폴백 이미지
}

const NAMES: Record<number, string> = {
  1: "김지연 팀장",
  2: "이준호 리드",
  3: "박성현 임원",
};

export default function InterviewerTile({
  interviewerId,
  isActive,
  mouthOpen,
  use3D,
  avatarImageUri,
}: Props) {
  return (
    <View style={[styles.tile, isActive && styles.tileActive]}>
      {/* 아바타 영역 */}
      <View style={styles.avatarArea}>
        {avatarImageUri ? (
          <Image source={{ uri: avatarImageUri }} style={styles.avatar2D} resizeMode="cover" />
        ) : (
          // placeholder: 이니셜 원
          <View style={[styles.avatarPlaceholder, isActive && styles.placeholderActive]}>
            <Text style={styles.initial}>{NAMES[interviewerId]?.[0] ?? "?"}</Text>
          </View>
        )}

        {/* 2D 립싱크: 입 모양 오버레이 */}
        {isActive && (
          <View
            style={[
              styles.mouth,
              { height: Math.max(2, mouthOpen * 14) },
            ]}
          />
        )}
      </View>

      {/* 이름 */}
      <Text style={[styles.name, isActive && styles.nameActive]}>
        {NAMES[interviewerId] ?? `면접관 ${interviewerId}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    margin: 6,
    borderRadius: 16,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: "transparent",
    minHeight: 160,
  },
  tileActive: {
    borderColor: "#4f46e5",
    backgroundColor: "#1a1832",
  },
  avatarArea: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatar2D: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderActive: { backgroundColor: "#312e81" },
  initial: { fontSize: 30, color: "#fff", fontWeight: "700" },
  mouth: {
    position: "absolute",
    bottom: 6,
    width: 24,
    backgroundColor: "#e55",
    borderRadius: 4,
  },
  name: { fontSize: 12, color: "#666" },
  nameActive: { color: "#a5b4fc", fontWeight: "600" },
});
