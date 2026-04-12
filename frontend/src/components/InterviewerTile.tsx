/**
 * 면접관 타일 컴포넌트
 *
 * size="main"  : FaceTime 메인 타일 — 발화 중인 면접관, 화면 대부분 차지
 * size="thumb" : 썸네일 타일 — 비발화 면접관, 우측 상단 소형
 *
 * 렌더링: CharacterAvatar (SVG 기반 일러스트 캐릭터)
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import CharacterAvatar from "./CharacterAvatar";
import { AvatarState } from "../hooks/useAvatarAnimation";

const NAMES: Record<number, string> = {
  1: "김지연 팀장",
  2: "이준호 리드",
  3: "박성현 임원",
};

const ROLES: Record<number, string> = {
  1: "인사팀",
  2: "개발팀",
  3: "경영진",
};

interface Props {
  interviewerId: number;
  isActive: boolean;
  avatarState: AvatarState;
  mouthOpen: number;
  size?: "main" | "thumb";
}

export default function InterviewerTile({
  interviewerId,
  isActive,
  avatarState,
  mouthOpen,
  size = "main",
}: Props) {
  const isMain = size === "main";

  return (
    <View
      style={[
        styles.tile,
        isMain ? styles.tileMain : styles.tileThumb,
        isActive && styles.tileActive,
      ]}
    >
      {/* 캐릭터 아바타 */}
      <CharacterAvatar
        interviewerId={interviewerId}
        avatarState={avatarState}
        mouthOpen={isActive ? mouthOpen : 0}
        style={styles.avatar}
      />

      {/* 이름 배지 — FaceTime 스타일 좌하단 오버레이 */}
      <View style={[styles.nameBadge, !isMain && styles.nameBadgeThumb]}>
        <Text
          style={[styles.nameText, !isMain && styles.nameTextThumb]}
          numberOfLines={1}
        >
          {NAMES[interviewerId] ?? `면접관 ${interviewerId}`}
        </Text>
        {isMain && (
          <Text style={styles.roleText}>{ROLES[interviewerId]}</Text>
        )}
      </View>

      {/* 발화 중 표시 — 좌상단 초록 점 */}
      {isActive && (
        <View style={[styles.speakDot, !isMain && styles.speakDotThumb]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 20,
    backgroundColor: "#141414",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  tileMain: {
    flex: 1,
  },
  tileThumb: {
    width: 108,
    height: 140,
    borderRadius: 14,
  },
  tileActive: {
    borderColor: "#6366f1",
  },
  avatar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // FaceTime 스타일 이름 배지
  nameBadge: {
    position: "absolute",
    bottom: 14,
    left: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  nameBadgeThumb: {
    bottom: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  nameText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  nameTextThumb: { fontSize: 10 },
  roleText: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 },

  // 발화 중 초록 점
  speakDot: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4ade80",
    shadowColor: "#4ade80",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  speakDotThumb: {
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
