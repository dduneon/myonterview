/**
 * 아바타 애니메이션 상태 훅
 *
 * Ready Player Me GLB에 포함된 표준 클립 이름:
 *   - "Idle"      → 대기 상태 (루프)
 *   - "Talking"   → 말하는 상태 (루프) — 질문 TTS 재생 중
 *   - "Thinking"  → 생각하는 상태 (루프) — 다음 질문 준비 중
 *
 * 클립 이름은 Ready Player Me 익스포트 기준이며, 커스텀 리깅 시 조정 필요.
 */
import { useRef, useCallback, useEffect } from "react";
import * as THREE from "three";

export type AvatarState = "idle" | "talking" | "thinking";

const CLIP_MAP: Record<AvatarState, string> = {
  idle: "Idle",
  talking: "Talking",
  thinking: "Thinking",
};

/** crossFade 지속 시간 (초) */
const FADE_DURATION = 0.3;

export function useAvatarAnimation(mixer: THREE.AnimationMixer | null, clips: THREE.AnimationClip[]) {
  const actionsRef = useRef<Partial<Record<AvatarState, THREE.AnimationAction>>>({});
  const currentStateRef = useRef<AvatarState>("idle");

  // 클립 → AnimationAction 등록
  useEffect(() => {
    if (!mixer || clips.length === 0) return;

    const actions: Partial<Record<AvatarState, THREE.AnimationAction>> = {};

    for (const [state, clipName] of Object.entries(CLIP_MAP) as [AvatarState, string][]) {
      // 클립 이름이 정확히 일치하지 않으면 부분 매칭으로 fallback
      const clip =
        clips.find((c) => c.name === clipName) ??
        clips.find((c) => c.name.toLowerCase().includes(state));

      if (clip) {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        actions[state] = action;
      }
    }

    actionsRef.current = actions;

    // idle 시작
    const idleAction = actions.idle;
    if (idleAction) {
      idleAction.play();
    } else if (clips.length > 0) {
      // idle 클립이 없으면 첫 번째 클립으로 fallback
      mixer.clipAction(clips[0]).setLoop(THREE.LoopRepeat, Infinity).play();
    }

    return () => {
      mixer.stopAllAction();
    };
  }, [mixer, clips]);

  const transitionTo = useCallback(
    (nextState: AvatarState) => {
      if (currentStateRef.current === nextState) return;

      const from = actionsRef.current[currentStateRef.current];
      const to = actionsRef.current[nextState];

      if (to) {
        if (from && from !== to) {
          from.crossFadeTo(to, FADE_DURATION, true);
          to.play();
        } else {
          to.reset().play();
        }
      }

      currentStateRef.current = nextState;
    },
    []
  );

  return { transitionTo, currentState: currentStateRef };
}
