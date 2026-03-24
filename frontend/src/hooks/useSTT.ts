/**
 * 음성 녹음 훅 (expo-av)
 * - startRecording / stopRecording
 * - 녹음 완료 시 base64 오디오 반환
 */
import { useRef, useState } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

/** 녹음 파일 URI → base64 문자열 변환 (플랫폼별 분기) */
async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    // 웹: blob URL → FileReader로 base64 변환
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // "data:audio/webm;base64,XXX" 에서 XXX만 추출
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  // 네이티브: expo-file-system 사용
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export function useSTT() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  async function startRecording() {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recordingRef.current = recording;
    setIsRecording(true);
  }

  async function stopRecording(): Promise<string | null> {
    const recording = recordingRef.current;
    if (!recording) return null;

    await recording.stopAndUnloadAsync();
    setIsRecording(false);
    recordingRef.current = null;

    const uri = recording.getURI();
    if (!uri) return null;

    return uriToBase64(uri);
  }

  return { startRecording, stopRecording, isRecording };
}
