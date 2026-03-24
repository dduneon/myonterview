/**
 * 질문 생성 로딩 화면
 * - 세션 상태를 2초마다 폴링
 * - questions_ready → InterviewScreen으로 이동
 */
import React, { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { getSession } from "../api/client";

const MESSAGES = [
  "이력서를 분석하고 있어요...",
  "회사 정보를 검색하고 있어요...",
  "맞춤 질문을 생성하고 있어요...",
  "면접관을 준비시키고 있어요...",
];

export default function LoadingScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [msgIndex, setMsgIndex] = React.useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 메시지 순환
    intervalRef.current = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2500);

    // 세션 상태 폴링 (2초마다)
    pollRef.current = setInterval(async () => {
      try {
        const session = await getSession(sessionId);
        if (session.status === "questions_ready") {
          clearInterval(pollRef.current!);
          clearInterval(intervalRef.current!);
          router.replace({ pathname: "/interview", params: { sessionId } });
        } else if (session.status === "failed") {
          clearInterval(pollRef.current!);
          clearInterval(intervalRef.current!);
          router.replace("/");
        }
      } catch {
        // 일시적 네트워크 오류는 무시하고 계속 폴링
      }
    }, 2000);

    return () => {
      clearInterval(intervalRef.current!);
      clearInterval(pollRef.current!);
    };
  }, [sessionId]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4f46e5" />
      <Text style={styles.message}>{MESSAGES[msgIndex]}</Text>
      <Text style={styles.sub}>AI가 맞춤 면접을 준비하고 있습니다</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" },
  message: { marginTop: 28, fontSize: 18, color: "#fff", fontWeight: "600", textAlign: "center" },
  sub: { marginTop: 10, fontSize: 14, color: "#666", textAlign: "center" },
});
