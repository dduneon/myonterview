/**
 * 피드백 리포트 화면
 * - 전체 점수 + 카테고리별 점수
 * - 강점 / 개선점
 * - 질문별 상세 리뷰
 * - 피드백 미완성 시 3초마다 폴링 (최대 5분)
 * - 녹화본 다운로드 버튼 (웹, 녹화 완료 시)
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { getFeedback, FeedbackResponse, QuestionFeedback } from "../api/client";
import { useInterviewStore } from "../store/interviewStore";

const SCORE_COLOR = (s: number) =>
  s >= 80 ? "#4ade80" : s >= 60 ? "#fbbf24" : "#f87171";

const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_LABEL: Record<string, string> = {
  intro: "자기소개", technical: "기술", behavioral: "경험",
  situational: "상황대처", company_specific: "회사특화", closing: "마무리",
};

function QuestionReviewCard({ qf }: { qf: QuestionFeedback }) {
  const [expanded, setExpanded] = useState(false);
  const isSkipped = qf.answer === "(건너뜀)" || !qf.answer;

  return (
    <View style={styles.qfCard}>
      {/* 헤더: Q번호 / 카테고리 / 점수 */}
      <View style={styles.qfHeader}>
        <View style={styles.qfHeaderLeft}>
          <Text style={styles.qfIndex}>Q{qf.question_id_index + 1}</Text>
          {qf.category && (
            <View style={styles.catBadge}>
              <Text style={styles.catBadgeText}>
                {CATEGORY_LABEL[qf.category] ?? qf.category}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.qfScore, { color: SCORE_COLOR(qf.score ?? 0) }]}>
          {qf.score ?? "-"}점
        </Text>
      </View>

      {/* 질문 텍스트 */}
      <Text style={styles.qfQuestion}>{qf.question ?? "질문 텍스트 없음"}</Text>

      {/* 내 답변 */}
      <View style={[styles.answerBox, isSkipped && styles.answerBoxSkipped]}>
        <Text style={styles.answerLabel}>{isSkipped ? "건너뜀" : "내 답변"}</Text>
        {!isSkipped && (
          <Text style={styles.answerText} numberOfLines={expanded ? undefined : 3}>
            {qf.answer}
          </Text>
        )}
        {!isSkipped && qf.answer && qf.answer.length > 120 && (
          <TouchableOpacity onPress={() => setExpanded((v) => !v)}>
            <Text style={styles.expandBtn}>{expanded ? "접기 ▲" : "더 보기 ▼"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 평가 요약 */}
      <Text style={styles.qfComment}>{qf.comment}</Text>

      {/* 잘한 점 */}
      {qf.good_points && (
        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackIcon}>✓</Text>
          <Text style={styles.feedbackGood}>{qf.good_points}</Text>
        </View>
      )}

      {/* 더 나은 답변 */}
      {qf.better_answer && (
        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackIcon}>💡</Text>
          <Text style={styles.feedbackBetter}>{qf.better_answer}</Text>
        </View>
      )}
    </View>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${score}%` as any, backgroundColor: SCORE_COLOR(score) }]} />
      </View>
      <Text style={[styles.scoreNum, { color: SCORE_COLOR(score) }]}>{score}</Text>
    </View>
  );
}

export default function FeedbackScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const clearSession = useInterviewStore((s) => s.clearSession);
  const recordingUrl = useInterviewStore((s) => s.recordingUrl);
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollFailed, setPollFailed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function poll() {
      try {
        const data = await getFeedback(sessionId);
        setFeedback(data);
        setLoading(false);
        clearInterval(timer);
      } catch (e: any) {
        if (e?.response?.status !== 202) {
          setLoading(false);
          setPollFailed(true);
          clearInterval(timer);
        }
      }
    }

    poll();
    timer = setInterval(poll, 3000);

    // 5분 타임아웃
    const timeout = setTimeout(() => {
      clearInterval(timer);
      setLoading(false);
      setPollFailed(true);
    }, POLL_TIMEOUT_MS);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [sessionId]);

  function handleRestart() {
    clearSession();
    router.replace("/");
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.loadingText}>피드백을 분석하고 있어요...</Text>
        <Text style={styles.loadingSub}>AI가 면접 내용을 평가 중입니다</Text>
      </View>
    );
  }

  if (pollFailed || !feedback) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>⚠️</Text>
        <Text style={styles.loadingText}>피드백 생성에 실패했습니다</Text>
        <Text style={styles.loadingSub}>잠시 후 다시 확인해주세요.</Text>
        <TouchableOpacity style={[styles.restartBtn, { marginTop: 32 }]} onPress={handleRestart}>
          <Text style={styles.restartBtnText}>처음으로 돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>면접 피드백</Text>

      {/* 전체 점수 */}
      <View style={styles.overallCard}>
        <Text style={styles.overallLabel}>종합 점수</Text>
        <Text style={[styles.overallScore, { color: SCORE_COLOR(feedback.overall_score ?? 0) }]}>
          {feedback.overall_score ?? "-"}
        </Text>
        <Text style={styles.overallMax}>/ 100</Text>
      </View>

      {/* 카테고리별 점수 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>카테고리별 점수</Text>
        <ScoreBar label="답변 구조" score={feedback.structure_score ?? 0} />
        <ScoreBar label="구체성" score={feedback.specificity_score ?? 0} />
        <ScoreBar label="직무 적합성" score={feedback.job_fit_score ?? 0} />
        <ScoreBar label="커뮤니케이션" score={feedback.communication_score ?? 0} />
      </View>

      {/* 강점 */}
      {(feedback.strengths ?? []).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>잘한 점</Text>
          {(feedback.strengths ?? []).map((s, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletGreen}>✓</Text>
              <Text style={styles.bulletText}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 개선점 */}
      {(feedback.improvements ?? []).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>개선할 점</Text>
          {(feedback.improvements ?? []).map((s, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletYellow}>→</Text>
              <Text style={styles.bulletText}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 질문별 상세 리뷰 */}
      {(feedback.question_feedbacks ?? []).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>질문별 상세 리뷰</Text>
          {(feedback.question_feedbacks ?? []).map((qf, i) => (
            <QuestionReviewCard key={i} qf={qf} />
          ))}
        </View>
      )}

      {/* 녹화본 다운로드 (웹 + 녹화 URL 있을 때) */}
      {recordingUrl && Platform.OS === "web" && (
        <TouchableOpacity
          style={styles.downloadBtn}
          onPress={() => {
            const a = document.createElement("a");
            a.href = recordingUrl;
            a.download = `interview_${sessionId}.webm`;
            a.click();
          }}
        >
          <Text style={styles.downloadBtnText}>🎥 면접 녹화본 다운로드</Text>
        </TouchableOpacity>
      )}

      {/* 다시 시작 */}
      <TouchableOpacity style={styles.restartBtn} onPress={handleRestart}>
        <Text style={styles.restartBtnText}>다시 시작하기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { padding: 20, paddingBottom: 60 },
  loadingContainer: {
    flex: 1, backgroundColor: "#0a0a0a",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  loadingText: { marginTop: 24, fontSize: 18, color: "#fff", fontWeight: "600" },
  loadingSub: { marginTop: 8, fontSize: 14, color: "#666" },
  title: { fontSize: 26, fontWeight: "800", color: "#fff", marginTop: 48, marginBottom: 24 },
  overallCard: {
    backgroundColor: "#141414", borderRadius: 16, padding: 24,
    alignItems: "center", marginBottom: 16,
  },
  overallLabel: { fontSize: 14, color: "#888", marginBottom: 8 },
  overallScore: { fontSize: 64, fontWeight: "800", lineHeight: 72 },
  overallMax: { fontSize: 16, color: "#444" },
  card: { backgroundColor: "#141414", borderRadius: 16, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 16 },
  scoreRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  scoreLabel: { width: 90, fontSize: 13, color: "#aaa" },
  barBg: { flex: 1, height: 6, backgroundColor: "#2a2a2a", borderRadius: 3, marginHorizontal: 10 },
  barFill: { height: 6, borderRadius: 3 },
  scoreNum: { width: 30, fontSize: 13, fontWeight: "700", textAlign: "right" },
  bulletRow: { flexDirection: "row", marginBottom: 10, gap: 10 },
  bulletGreen: { fontSize: 15, color: "#4ade80", marginTop: 1 },
  bulletYellow: { fontSize: 15, color: "#fbbf24", marginTop: 1 },
  bulletText: { flex: 1, fontSize: 14, color: "#ccc", lineHeight: 20 },
  // 질문별 리뷰 카드
  qfCard: {
    borderTopWidth: 1, borderTopColor: "#222",
    paddingTop: 18, marginTop: 18,
  },
  qfHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  qfHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  qfIndex: { fontSize: 13, fontWeight: "800", color: "#888" },
  catBadge: {
    backgroundColor: "#1e1e2e", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  catBadgeText: { fontSize: 11, color: "#818cf8", fontWeight: "600" },
  qfScore: { fontSize: 15, fontWeight: "800" },

  // 질문 텍스트
  qfQuestion: { fontSize: 15, color: "#fff", fontWeight: "600", lineHeight: 22, marginBottom: 12 },

  // 내 답변 박스
  answerBox: {
    backgroundColor: "#1a1a1a", borderRadius: 10,
    padding: 12, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: "#4f46e5",
  },
  answerBoxSkipped: { borderLeftColor: "#444" },
  answerLabel: { fontSize: 11, color: "#666", fontWeight: "600", marginBottom: 4 },
  answerText: { fontSize: 14, color: "#bbb", lineHeight: 20 },
  expandBtn: { fontSize: 12, color: "#6366f1", marginTop: 6, fontWeight: "600" },

  // AI 피드백
  qfComment: { fontSize: 13, color: "#888", lineHeight: 19, marginBottom: 8 },
  feedbackRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  feedbackIcon: { fontSize: 14, marginTop: 1 },
  feedbackGood: { flex: 1, fontSize: 13, color: "#4ade80", lineHeight: 19 },
  feedbackBetter: { flex: 1, fontSize: 13, color: "#fbbf24", lineHeight: 19 },
  downloadBtn: {
    marginTop: 8, backgroundColor: "#1a1a1a",
    borderRadius: 14, paddingVertical: 16, alignItems: "center",
    borderWidth: 1, borderColor: "#333", marginBottom: 12,
  },
  downloadBtnText: { color: "#aaa", fontSize: 15, fontWeight: "600" },
  restartBtn: {
    marginTop: 8, backgroundColor: "#4f46e5",
    borderRadius: 14, paddingVertical: 18, alignItems: "center",
  },
  restartBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
