/**
 * CharacterAvatar — 카카오프렌즈 스타일 귀여운 캐릭터
 *
 * 면접관 3인:
 *   1. 김지연 팀장 — 고양이 (핑크/로즈)
 *   2. 이준호 리드  — 곰     (꿀색/네이비)
 *   3. 박성현 임원  — 강아지 (화이트/다크)
 *
 * mouthOpen(0~1) → 입 애니메이션 (립싱크)
 * avatarState    → 눈 표정 변화 (thinking: 가늘게 + 시선 이동)
 */
import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, {
  Circle, Ellipse, Path, Rect, G, Defs, LinearGradient, Stop,
} from "react-native-svg";
import { AvatarState } from "../hooks/useAvatarAnimation";

// ─── 캔버스 ────────────────────────────────────────────────────
const W = 200;
const H = 240;

// 머리 (크고 둥글게 — 치비 비율)
const HEAD_CX = 100;
const HEAD_CY = 120;
const HEAD_R  = 74;

// 눈 (크고 애니메 스타일)
const L_EYE_X     = 77;
const R_EYE_X     = 123;
const EYE_Y       = 109;
const SCLERA_RX   = 15;
const SCLERA_RY   = 14;
const IRIS_R      = 12;
const PUPIL_R     = 7;

// 입
const MOUTH_CX = 100;
const MOUTH_Y  = 138;

// 볼 (블러시)
const BLUSH_Y    = 128;
const L_BLUSH_X  = 63;
const R_BLUSH_X  = 137;

// 몸통 시작 y
const BODY_TOP = 184;

// ─── 캐릭터 설정 ────────────────────────────────────────────────
interface CharConfig {
  bgTop:         string;
  bgBottom:      string;
  face:          string;
  faceShadow:    string;
  eyeIris:       string;
  blush:         string;
  outfit:        string;
  outfitAccent:  string;
  earOuter:      string;
  earInner:      string;
  type:          "cat" | "bear" | "dog";
  noseFill:      string;
  noseStroke:    string;
}

const CHARS: Record<number, CharConfig> = {
  1: {
    bgTop:        "#3A0D22",
    bgBottom:     "#1A0810",
    face:         "#FFF4E8",
    faceShadow:   "#F0DCCC",
    eyeIris:      "#3C1818",
    blush:        "#FF8FAB",
    outfit:       "#C42848",
    outfitAccent: "#E83A60",
    earOuter:     "#EED8C0",
    earInner:     "#FFB0C8",
    type:         "cat",
    noseFill:     "#FFB0C4",
    noseStroke:   "#D07888",
  },
  2: {
    bgTop:        "#091830",
    bgBottom:     "#040C18",
    face:         "#E8C090",
    faceShadow:   "#CCA070",
    eyeIris:      "#2C1808",
    blush:        "#FF9060",
    outfit:       "#183460",
    outfitAccent: "#204478",
    earOuter:     "#C8A070",
    earInner:     "#A07848",
    type:         "bear",
    noseFill:     "#281808",
    noseStroke:   "#140C04",
  },
  3: {
    bgTop:        "#160A2E",
    bgBottom:     "#0A0418",
    face:         "#F6F2EC",
    faceShadow:   "#E0D8CC",
    eyeIris:      "#1A1840",
    blush:        "#FFB0C0",
    outfit:       "#141420",
    outfitAccent: "#202030",
    earOuter:     "#DDD5C5",
    earInner:     "#C8BCAC",
    type:         "dog",
    noseFill:     "#2C2018",
    noseStroke:   "#160C08",
  },
};

// ─── 눈 컴포넌트 ─────────────────────────────────────────────────
function CuteEye({
  cx, cy, irisColor, isThinking,
}: {
  cx: number; cy: number; irisColor: string; isThinking: boolean;
}) {
  const scleraRY = isThinking ? 8 : SCLERA_RY;
  const irisR    = isThinking ? 9 : IRIS_R;
  const pdx      = isThinking ? 3 : 0;  // 시선 이동

  return (
    <G>
      {/* 흰자 */}
      <Ellipse cx={cx} cy={cy} rx={SCLERA_RX} ry={scleraRY} fill="white" />
      {/* 홍채 */}
      <Circle cx={cx + pdx} cy={cy} r={irisR} fill={irisColor} />
      {/* 동공 */}
      <Circle cx={cx + pdx} cy={cy} r={PUPIL_R} fill="#080808" />
      {/* 큰 하이라이트 */}
      <Circle cx={cx + pdx - 4} cy={cy - 4} r={4.5} fill="white" opacity={0.9} />
      {/* 작은 하이라이트 */}
      <Circle cx={cx + pdx + 3} cy={cy + 3} r={2} fill="white" opacity={0.5} />
      {/* 위 눈꺼풀 그림자 */}
      <Ellipse
        cx={cx}
        cy={cy - scleraRY * 0.42}
        rx={SCLERA_RX - 1}
        ry={scleraRY * 0.42}
        fill="rgba(0,0,0,0.06)"
      />
    </G>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────
interface Props {
  interviewerId: number;
  avatarState:   AvatarState;
  mouthOpen:     number;
  style?:        object;
}

export default function CharacterAvatar({
  interviewerId, avatarState, mouthOpen, style,
}: Props) {
  const char = CHARS[interviewerId] ?? CHARS[1];
  const isThinking = avatarState === "thinking";

  // 입 계산
  const mo        = Math.max(0, Math.min(1, mouthOpen));
  const showOpen  = mo > 0.12;
  const openH     = mo * 12; // 최대 12px

  const gradId = `bg_${interviewerId}`;

  return (
    <View style={[styles.container, style]}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={char.bgTop}    stopOpacity="1" />
            <Stop offset="1" stopColor={char.bgBottom} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* ── 배경 ── */}
        <Rect width={W} height={H} fill={`url(#${gradId})`} />

        {/* ── 강아지 귀 (머리 뒤) ── */}
        {char.type === "dog" && (
          <G>
            {/* 왼쪽 귀 외각 */}
            <Path
              d="M 37,76 C 20,94 17,150 27,168 C 37,182 58,182 64,170 C 56,150 44,102 47,74 Z"
              fill={char.earOuter}
            />
            {/* 왼쪽 귀 안쪽 (어두운 결) */}
            <Path
              d="M 43,82 C 30,98 28,148 36,164 C 42,174 54,175 59,166 C 52,148 44,102 46,80 Z"
              fill={char.earInner}
              opacity={0.65}
            />
            {/* 오른쪽 귀 외각 */}
            <Path
              d="M 163,76 C 180,94 183,150 173,168 C 163,182 142,182 136,170 C 144,150 156,102 153,74 Z"
              fill={char.earOuter}
            />
            {/* 오른쪽 귀 안쪽 */}
            <Path
              d="M 157,82 C 170,98 172,148 164,164 C 158,174 146,175 141,166 C 148,148 156,102 154,80 Z"
              fill={char.earInner}
              opacity={0.65}
            />
          </G>
        )}

        {/* ── 몸통 / 어깨 ── */}
        <Path
          d={`
            M -4,${H + 4}
            L -4,${BODY_TOP + 18}
            C 14,${BODY_TOP + 6} 46,${BODY_TOP - 2} 70,${BODY_TOP - 4}
            L 130,${BODY_TOP - 4}
            C 154,${BODY_TOP - 2} 186,${BODY_TOP + 6} ${W + 4},${BODY_TOP + 18}
            L ${W + 4},${H + 4} Z
          `}
          fill={char.outfit}
        />

        {/* 강아지: 흰 셔츠 + 넥타이 나비 */}
        {char.type === "dog" && (
          <G>
            <Path
              d={`M 82,${BODY_TOP - 2} L 100,${BODY_TOP + 20} L 118,${BODY_TOP - 2}`}
              fill="white"
              opacity={0.18}
            />
            {/* 나비넥타이 */}
            <Path
              d={`M 92,${BODY_TOP + 5} L 80,${BODY_TOP - 2} L 83,${BODY_TOP + 12} Z`}
              fill="#8B1515"
            />
            <Path
              d={`M 108,${BODY_TOP + 5} L 120,${BODY_TOP - 2} L 117,${BODY_TOP + 12} Z`}
              fill="#8B1515"
            />
            <Circle cx={100} cy={BODY_TOP + 5} r={5.5} fill="#AA2020" />
          </G>
        )}

        {/* 고양이: 목걸이 */}
        {char.type === "cat" && (
          <G>
            <Rect
              x={70}
              y={BODY_TOP - 5}
              width={60}
              height={9}
              rx={4.5}
              fill={char.outfitAccent}
            />
            {/* 방울 */}
            <Circle cx={100} cy={BODY_TOP + 8} r={6} fill="#FFD700" />
            <Circle cx={100} cy={BODY_TOP + 8} r={2} fill="#B8860B" />
          </G>
        )}

        {/* 곰: 후드 끈 */}
        {char.type === "bear" && (
          <G>
            <Path
              d={`M 84,${BODY_TOP - 4} L 80,${BODY_TOP + 22}`}
              stroke={char.outfitAccent}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <Path
              d={`M 116,${BODY_TOP - 4} L 120,${BODY_TOP + 22}`}
              stroke={char.outfitAccent}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </G>
        )}

        {/* ── 머리 ── */}
        <Circle cx={HEAD_CX} cy={HEAD_CY} r={HEAD_R} fill={char.face} />
        {/* 머리 측면 그림자 (입체감) */}
        <Ellipse
          cx={HEAD_CX + 6}
          cy={HEAD_CY + 8}
          rx={66}
          ry={62}
          fill={char.faceShadow}
          opacity={0.12}
        />

        {/* ── 곰 귀 (머리 위에 겹침) ── */}
        {char.type === "bear" && (
          <G>
            <Circle cx={64}  cy={52} r={23} fill={char.earOuter} />
            <Circle cx={64}  cy={57} r={14} fill={char.earInner} />
            <Circle cx={136} cy={52} r={23} fill={char.earOuter} />
            <Circle cx={136} cy={57} r={14} fill={char.earInner} />
          </G>
        )}

        {/* ── 고양이 귀 (머리 위에 겹침) ── */}
        {char.type === "cat" && (
          <G>
            {/* 왼쪽 귀 바깥 */}
            <Path d="M 43,62 L 62,12 L 92,56 Z" fill={char.earOuter} />
            {/* 왼쪽 귀 안쪽 (핑크) */}
            <Path d="M 52,56 L 63,24 L 87,54 Z" fill={char.earInner} />
            {/* 오른쪽 귀 바깥 */}
            <Path d="M 157,62 L 138,12 L 108,56 Z" fill={char.earOuter} />
            {/* 오른쪽 귀 안쪽 */}
            <Path d="M 148,56 L 137,24 L 113,54 Z" fill={char.earInner} />
          </G>
        )}

        {/* 고양이 리본 (왼쪽 귀 근처) */}
        {char.type === "cat" && (
          <G>
            <Path d="M 69,54 L 57,44 L 61,60 Z" fill="#FF4D6A" />
            <Path d="M 69,54 L 81,44 L 77,60 Z" fill="#FF4D6A" />
            <Circle cx={69} cy={54} r={5.5} fill="#FF6B82" />
            <Circle cx={69} cy={52} r={2}   fill="white" opacity={0.45} />
          </G>
        )}

        {/* ── 볼 터치 (블러시) ── */}
        <Ellipse
          cx={L_BLUSH_X} cy={BLUSH_Y}
          rx={17} ry={10}
          fill={char.blush} opacity={0.42}
        />
        <Ellipse
          cx={R_BLUSH_X} cy={BLUSH_Y}
          rx={17} ry={10}
          fill={char.blush} opacity={0.42}
        />

        {/* ── 눈 ── */}
        <CuteEye
          cx={L_EYE_X} cy={EYE_Y}
          irisColor={char.eyeIris}
          isThinking={isThinking}
        />
        <CuteEye
          cx={R_EYE_X} cy={EYE_Y}
          irisColor={char.eyeIris}
          isThinking={isThinking}
        />

        {/* ── 코 ── */}
        {char.type === "cat" && (
          // 고양이: 하트 모양 코
          <Path
            d="M 97,122 C 95,119 100,117 100,117 C 100,117 105,119 103,122 C 101,125 100,126 100,126 C 100,126 99,125 97,122 Z"
            fill={char.noseFill}
            stroke={char.noseStroke}
            strokeWidth="0.5"
          />
        )}
        {char.type === "bear" && (
          // 곰: 넓은 타원 코
          <Ellipse cx={100} cy={124} rx={9} ry={6} fill={char.noseFill} />
        )}
        {char.type === "dog" && (
          // 강아지: 둥근 버튼 코
          <Ellipse cx={100} cy={122} rx={8} ry={6.5} fill={char.noseFill} />
        )}

        {/* ── 입 (립싱크 애니메이션) ── */}
        {!showOpen ? (
          // 닫힌 입: 귀여운 ∪ 미소
          <Path
            d={`M 87,${MOUTH_Y} C 93,${MOUTH_Y + 10} 107,${MOUTH_Y + 10} 113,${MOUTH_Y}`}
            stroke="#2A1818"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          // 열린 입: 말하는 중
          <G>
            {/* 입 안 (어두운 공간) */}
            <Ellipse
              cx={MOUTH_CX}
              cy={MOUTH_Y + 4}
              rx={11}
              ry={Math.max(3, openH / 2 + 2)}
              fill="#1A0808"
            />
            {/* 치아 */}
            {openH > 5 && (
              <Rect
                x={91}
                y={MOUTH_Y}
                width={18}
                height={Math.min(openH * 0.38, 6)}
                rx={2}
                fill="white"
              />
            )}
            {/* 윗입술 곡선 */}
            <Path
              d={`M 89,${MOUTH_Y} C 94,${MOUTH_Y - 4} 106,${MOUTH_Y - 4} 111,${MOUTH_Y}`}
              stroke="#4A2828"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          </G>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
});
