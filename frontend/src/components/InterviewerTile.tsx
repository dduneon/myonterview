/**
 * 면접관 타일 컴포넌트
 *
 * 렌더링 전략:
 *   웹(브라우저) : AvatarCanvasWeb — @react-three/fiber 웹 Canvas, 원격 URL 직접 로드
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
  avatarImageUri?: string;  // 2D 폴백 이미지 URI
}

export default function InterviewerTile({
  interviewerId,
  isActive,
  avatarState,
  mouthOpen,
  use3D,
  avatarImageUri,
}: Props) {
  const [glbUri, setGlbUri] = useState<string | null>(null);
  const remoteUrl = AVATAR_REMOTE_URLS[interviewerId] || null;
  const isWeb = Platform.OS === "web";

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
    <View style={[styles.tile, isActive && styles.tileActive]}>
      {/* 아바타 영역 */}
      {showWeb3D && AvatarCanvasWeb ? (
        <AvatarCanvasWeb
          url={remoteUrl}
          avatarState={avatarState}
          mouthOpen={isActive ? mouthOpen : 0}
          style={styles.canvas3D}
        />
      ) : showNative3D ? (
        <AvatarCanvas
          glbUri={glbUri}
          avatarState={avatarState}
          mouthOpen={isActive ? mouthOpen : 0}
          style={styles.canvas3D}
        />
      ) : (
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

      {/* 이름 + 역할 */}
      <View style={styles.nameArea}>
        <Text style={[styles.name, isActive && styles.nameActive]}>
          {NAMES[interviewerId] ?? `면접관 ${interviewerId}`}
        </Text>
        <Text style={styles.role}>{ROLES[interviewerId]}</Text>
      </View>

      {/* 활성 상태 인디케이터 */}
      {isActive && <View style={styles.activeDot} />}
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
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    minHeight: 180,
  },
  tileActive: {
    borderColor: "#4f46e5",
    backgroundColor: "#1a1832",
  },

  // 3D 캔버스
  canvas3D: {
    width: "100%",
    height: 140,
    borderRadius: 12,
  },

  // 2D 폴백
  avatarArea2D: {
    width: 90,
    height: 90,
    marginTop: 16,
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

  // 이름
  nameArea: { marginTop: 8, marginBottom: 10, alignItems: "center" },
  name: { fontSize: 12, color: "#666", fontWeight: "500" },
  nameActive: { color: "#a5b4fc", fontWeight: "700" },
  role: { fontSize: 10, color: "#444", marginTop: 2 },

  // 활성 점
  activeDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ade80",
  },
});
