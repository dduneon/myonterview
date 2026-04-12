/**
 * 립싱크 훅
 *
 * expo-av isMeteringEnabled는 웹에서 미지원 → isPlaying 기반
 * 사인파 시뮬레이션으로 자연스러운 입 움직임 구현.
 * 네이티브에서도 동일하게 동작해 일관성 보장.
 */
import { useRef, useState, useCallback, useEffect } from "react";
import { Audio } from "expo-av";

export function useLipSync() {
  const soundRef  = useRef<Audio.Sound | null>(null);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // isPlaying → 사인파 기반 립싱크 시뮬레이션 (80ms 간격, ~12fps)
  useEffect(() => {
    if (!isPlaying) {
      setMouthOpen(0);
      return;
    }
    const id = setInterval(() => {
      const t = Date.now() / 1000;
      // 두 주파수 합성 → 자연스러운 말하기 파형
      const val = Math.max(0, 0.25 + 0.5 * Math.sin(t * 9) * Math.abs(Math.sin(t * 3.3)));
      setMouthOpen(val);
    }, 80);
    return () => clearInterval(id);
  }, [isPlaying]);

  const play = useCallback(async (audioUrl: string, onFinish?: () => void) => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    setIsPlaying(true);

    const { sound } = await Audio.Sound.createAsync(
      { uri: audioUrl },
      { shouldPlay: true },
      (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setIsPlaying(false);
          onFinish?.();
        }
      }
    );

    soundRef.current = sound;
  }, []);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return { mouthOpen, isPlaying, play, stop };
}
