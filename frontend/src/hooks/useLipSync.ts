/**
 * 립싱크 훅 (expo-av isMeteringEnabled 방식)
 * - TTS 오디오 재생 + 볼륨 분석 → mouthOpen 값(0~1) 제공
 */
import { useRef, useState, useCallback } from "react";
import { Audio } from "expo-av";

export function useLipSync() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const play = useCallback(async (audioUrl: string, onFinish?: () => void) => {
    // 기존 재생 중이면 중단
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: audioUrl },
      {
        shouldPlay: true,
        progressUpdateIntervalMillis: 50,
        isMeteringEnabled: true,   // 핵심: 볼륨 측정 활성화
      },
      (status) => {
        if (!status.isLoaded) return;

        if (status.isPlaying) {
          // metering: -160 ~ 0 dB → 0~1로 정규화
          const db = status.metering ?? -160;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          setMouthOpen(normalized);
          setIsPlaying(true);
        }

        if (status.didJustFinish) {
          setMouthOpen(0);
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
    setMouthOpen(0);
    setIsPlaying(false);
  }, []);

  return { mouthOpen, isPlaying, play, stop };
}
