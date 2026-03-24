/**
 * 음성 녹음 훅 (expo-av)
 * - startRecording / stopRecording
 * - 녹음 완료 시 base64 오디오 반환
 */
import { useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

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

    // base64로 변환해서 WebSocket으로 전송
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64;
  }

  return { startRecording, stopRecording, isRecording };
}
