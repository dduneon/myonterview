/**
 * 음성 녹음 훅 (expo-av)
 * - startRecording / stopRecording
 * - 녹음 완료 시 base64 오디오 반환
 */
import { useRef, useState, useEffect } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export function useSTT() {
  const recordingRef  = useRef<Audio.Recording | null>(null);
  const isStartingRef = useRef(false); // 비동기 race condition 방지용 동기 락
  const [isRecording, setIsRecording] = useState(false);

  // 언마운트 시 진행 중인 녹음 정리 (Strict Mode 이중 마운트 포함)
  useEffect(() => {
    return () => {
      const rec = recordingRef.current;
      if (rec) {
        recordingRef.current = null;
        rec.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  async function startRecording() {
    if (recordingRef.current || isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      await Audio.requestPermissionsAsync();

      // setAudioModeAsync는 iOS 전용 설정 — 웹에서 호출하면
      // expo-av 내부 녹음 상태 체크가 실행되면서 오류 발생
      if (Platform.OS !== "web") {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      recordingRef.current = null;
      setIsRecording(false);
    } finally {
      isStartingRef.current = false;
    }
  }

  async function stopRecording(): Promise<string | null> {
    const recording = recordingRef.current;
    if (!recording) return null;

    // 선 null 처리 → 후속 startRecording 중복 호출 방지
    recordingRef.current = null;
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
    } catch {
      return null;
    }

    const uri = recording.getURI();
    if (!uri) return null;

    return uriToBase64(uri);
  }

  return { startRecording, stopRecording, isRecording };
}
