/**
 * 질문 생성 로딩 화면
 * - 세션 상태를 2초마다 폴링
 * - questions_ready → InterviewScreen으로 이동
 * - 3분 타임아웃 또는 failed 상태 → 에러 화면
 */
import React, { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { getSession } from "../api/client";

const MESSAGES = [
  "이력서를 분석하고 있어요...",
  "회사 정보를 검색하고 있어요...",
  "맞춤 질문을 생성하고 있어요...",
  "면접관을 준비시키고 있어요...",
];
const TIMEOUT_MS = 3 * 60 * 1000;

export default function LoadingScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [msgIndex, setMsgIndex] = React.useState(0);
  const [timedOut, setTimedOut] = React.useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cleanup() {
    clearInterval(intervalRef.current!);
    clearInterval(pollRef.current!);
    clearTimeout(timeoutRef.current!);
  }

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2500);

    timeoutRef.current = setTimeout(() => {
      cleanup();
      setTimedOut(true);
    }, TIMEOUT_MS);

    pollRef.current = setInterval(async () => {
      try {
        const session = await getSession(sessionId);
        if (session.status === "questions_ready") {
          cleanup();
          router.replace({ pathname: "/interview", params: { sessionId } });
        } else if (session.status === "failed") {
          cleanup();
          setTimedOut(true);
        }
      } catch {
        // 일시적 네트워크 오류 무시
      }
    }, 2000);

    return cleanup;
  }, [sessionId]);

  if (timedOut) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>질문 생성에 실패했습니다</Text>
        <Text style={styles.errorSub}>네트워크 상태를 확인하고 다시 시도해주세요.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => router.replace("/")}>
          <Text style={styles.retryBtnText}>처음으로 돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4f46e5" />
      <Text style={styles.message}>{MESSAGES[msgIndex]}</Text>
      <Text style={styles.sub}>AI가 맞춤 면접을 준비하고 있습니다</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center", padding: 24 },
  message: { marginTop: 28, fontSize: 18, color: "#fff", fontWeight: "600", textAlign: "center" },
  sub: { marginTop: 10, fontSize: 14, color: "#666", textAlign: "center" },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 20, color: "#fff", fontWeight: "700", marginBottom: 8 },
  errorSub: { fontSize: 14, color: "#888", textAlign: "center", marginBottom: 32 },
  retryBtn: { backgroundColor: "#4f46e5", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  retryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
