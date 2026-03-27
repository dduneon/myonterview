/**
 * 면접관 타일 컴포넌트
 *
 * size="main"  : FaceTime 메인 타일 — 발화 중인 면접관, 화면 대부분 차지
 * size="thumb" : 썸네일 타일 — 비발화 면접관, 우측 상단 소형
 *
 * 렌더링 전략:
 *   웹(브라우저) : AvatarCanvasWeb — 순수 Three.js
 *   네이티브 고사양: AvatarCanvas  — expo-gl + Three.js, 로컬 캐시 GLB
 *   네이티브 저사양: 2D 이미지 + 볼륨 기반 입 모양 오버레이
 */
import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, Platform } from "react-native";
import AvatarCanvas from "./AvatarCanvas";
import { AvatarState } from "../hooks/useAvatarAnimation";
import { loadAvatarGlb } from "../utils/avatarCache";

// 웹에서만 웹 전용 Canvas 로드 (expo-gl 없이 동작)
let AvatarCanvasWeb: React.ComponentType<{
  url: string | null;
  avatarState: AvatarState;
  mouthOpen: number;
  headshot?: boolean;
  style?: any;
}> | null = null;
if (Platform.OS === "web") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AvatarCanvasWeb = require("./AvatarCanvasWeb").default;
}

// S3에 업로드된 경량화 GLB URL (배포 시 실제 URL로 교체)
const AVATAR_REMOTE_URLS: Record<number, string> = {
  1: process.env.EXPO_PUBLIC_AVATAR_URL_1 ?? "",
  2: process.env.EXPO_PUBLIC_AVATAR_URL_2 ?? "",
  3: process.env.EXPO_PUBLIC_AVATAR_URL_3 ?? "",
};

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
  mouthOpen: number;        // 0~1
  use3D: boolean;
  size?: "main" | "thumb";
  avatarImageUri?: string;  // 2D 폴백 이미지 URI
}

export default function InterviewerTile({
  interviewerId,
  isActive,
  avatarState,
  mouthOpen,
  use3D,
  size = "main",
  avatarImageUri,
}: Props) {
  const [glbUri, setGlbUri] = useState<string | null>(null);
  const remoteUrl = AVATAR_REMOTE_URLS[interviewerId] || null;
  const isWeb = Platform.OS === "web";
  const isMain = size === "main";

  // 네이티브 3D: GLB 로컬 캐시 로드
  useEffect(() => {
    if (isWeb || !use3D || !remoteUrl) return;
    loadAvatarGlb(`interviewer_${interviewerId}`, remoteUrl)
      .then(setGlbUri)
      .catch((e) => console.warn(`[InterviewerTile] GLB 로드 실패 (id=${interviewerId}):`, e));
  }, [use3D, interviewerId, isWeb]);

  // 웹 3D: AvatarCanvasWeb으로 원격 URL 직접 로드
  const showWeb3D = isWeb && use3D && AvatarCanvasWeb;
  // 네이티브 3D: expo-gl + 로컬 캐시
  const showNative3D = !isWeb && use3D;

  return (
    <View style={[
      styles.tile,
      isMain ? styles.tileMain : styles.tileThumb,
      isActive && styles.tileActive,
    ]}>
      {/* 아바타 영역 — 타일 전체를 채움 */}
      {showWeb3D && AvatarCanvasWeb ? (
        <AvatarCanvasWeb
          url={remoteUrl}
          avatarState={avatarState}
          mouthOpen={isActive ? mouthOpen : 0}
          headshot={isMain}
          style={
            isMain
              // flex:1 부모에서 height:100%가 0으로 resolve → absolute로 꽉 채움
              ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%" }
              // thumb은 부모(108×140 고정)가 있어 100%가 정상 동작
              : { width: "100%", height: "100%" }
          }
        />
      ) : showNative3D ? (
        <AvatarCanvas
          glbUri={glbUri}
          avatarState={avatarState}
          mouthOpen={isActive ? mouthOpen : 0}
          style={styles.canvasNative}
        />
      ) : (
        /* 2D 폴백 */
        <View style={styles.avatarArea2D}>
          {avatarImageUri ? (
            <Image source={{ uri: avatarImageUri }} style={styles.avatar2D} resizeMode="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, isActive && styles.placeholderActive]}>
              <Text style={styles.initial}>{NAMES[interviewerId]?.[0] ?? "?"}</Text>
            </View>
          )}
          {/* 2D 립싱크: 입 모양 오버레이 */}
          {isActive && avatarState === "talking" && (
            <View style={[styles.mouth, { height: Math.max(2, mouthOpen * 14) }]} />
          )}
        </View>
      )}

      {/* 이름 배지 — FaceTime 스타일 좌하단 오버레이 */}
      <View style={[styles.nameBadge, !isMain && styles.nameBadgeThumb]}>
        <Text style={[styles.nameText, !isMain && styles.nameTextThumb]} numberOfLines={1}>
          {NAMES[interviewerId] ?? `면접관 ${interviewerId}`}
        </Text>
        {isMain && (
          <Text style={styles.roleText}>{ROLES[interviewerId]}</Text>
        )}
      </View>

      {/* 발화 중 표시 — 테두리 맥동 대신 좌상단 초록 점 */}
      {isActive && <View style={[styles.speakDot, !isMain && styles.speakDotThumb]} />}
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

  // 네이티브 3D 캔버스 (전체 채움)
  canvasNative: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
  },

  // 2D 폴백
  avatarArea2D: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar2D: { width: 90, height: 90, borderRadius: 45 },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderActive: { backgroundColor: "#312e81" },
  initial: { fontSize: 34, color: "#fff", fontWeight: "700" },
  mouth: {
    position: "absolute",
    bottom: 8,
    width: 26,
    backgroundColor: "#c0392b",
    borderRadius: 4,
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
