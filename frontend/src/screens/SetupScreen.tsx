/**
 * 사전 설정 화면
 * - 이력서 업로드 (PDF/DOCX)
 * - 포트폴리오 파일 또는 URL
 * - 회사명 / 직무명 / 면접 유형 / 예상 시간 / 면접관 수
 */
import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { createSession } from "../api/client";
import { useInterviewStore } from "../store/interviewStore";

function toFileField(asset: DocumentPicker.DocumentPickerAsset) {
  if (Platform.OS === "web" && (asset as any).file instanceof File) {
    return (asset as any).file as File;
  }
  return { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" };
}

const DURATION_OPTIONS = [15, 30, 45];
const TYPE_OPTIONS = ["신입", "경력"];
const INTERVIEWER_COUNT_OPTIONS = [1, 2, 3];

export default function SetupScreen() {
  const router = useRouter();
  const setSession = useInterviewStore((s) => s.setSession);

  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [interviewType, setInterviewType] = useState("신입");
  const [duration, setDuration] = useState(30);
  const [interviewerCount, setInterviewerCount] = useState(3);
  const [resumeFile, setResumeFile] = useState<any>(null);
  const [portfolioFile, setPortfolioFile] = useState<any>(null);
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function pickResume() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    });
    if (!result.canceled) setResumeFile(result.assets[0]);
  }

  async function pickPortfolio() {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf"] });
    if (!result.canceled) setPortfolioFile(result.assets[0]);
  }

  async function handleStart() {
    if (!company.trim()) return Alert.alert("회사명을 입력해주세요.");
    if (!jobTitle.trim()) return Alert.alert("지원 직무를 입력해주세요.");
    if (!resumeFile) return Alert.alert("이력서 파일을 업로드해주세요.");

    setLoading(true);
    try {
      const session = await createSession({
        company,
        job_title: jobTitle,
        interview_type: interviewType,
        duration_minutes: duration,
        interviewer_count: interviewerCount,
        resume_file: toFileField(resumeFile),
        portfolio_file: portfolioFile ? toFileField(portfolioFile) : null,
        portfolio_url: portfolioUrl || undefined,
      });
      setSession(session);
      router.push({ pathname: "/loading", params: { sessionId: session.id } });
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "세션 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>면터뷰</Text>
      <Text style={styles.subtitle}>AI 모의 면접을 시작하기 전에 정보를 입력해주세요.</Text>

      {/* 이력서 업로드 */}
      <Text style={styles.label}>이력서 *</Text>
      <TouchableOpacity style={styles.uploadBtn} onPress={pickResume}>
        <Text style={styles.uploadText}>
          {resumeFile ? `✓  ${resumeFile.name}` : "+ PDF 또는 DOCX 업로드"}
        </Text>
      </TouchableOpacity>

      {/* 포트폴리오 */}
      <Text style={styles.label}>포트폴리오 (선택)</Text>
      <TouchableOpacity style={styles.uploadBtn} onPress={pickPortfolio}>
        <Text style={styles.uploadText}>
          {portfolioFile ? `✓  ${portfolioFile.name}` : "+ PDF 업로드"}
        </Text>
      </TouchableOpacity>
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        placeholder="또는 포트폴리오 URL 입력"
        placeholderTextColor="#666"
        value={portfolioUrl}
        onChangeText={setPortfolioUrl}
        keyboardType="url"
        autoCapitalize="none"
      />

      {/* 회사명 */}
      <Text style={styles.label}>지원 회사명 *</Text>
      <TextInput
        style={styles.input}
        placeholder="예: 카카오"
        placeholderTextColor="#666"
        value={company}
        onChangeText={setCompany}
      />

      {/* 직무명 */}
      <Text style={styles.label}>지원 직무 *</Text>
      <TextInput
        style={styles.input}
        placeholder="예: 백엔드 개발자"
        placeholderTextColor="#666"
        value={jobTitle}
        onChangeText={setJobTitle}
      />

      {/* 면접 유형 */}
      <Text style={styles.label}>면접 유형</Text>
      <View style={styles.row}>
        {TYPE_OPTIONS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, interviewType === t && styles.chipActive]}
            onPress={() => setInterviewType(t)}
          >
            <Text style={[styles.chipText, interviewType === t && styles.chipTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 예상 시간 */}
      <Text style={styles.label}>예상 면접 시간</Text>
      <View style={styles.row}>
        {DURATION_OPTIONS.map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.chip, duration === d && styles.chipActive]}
            onPress={() => setDuration(d)}
          >
            <Text style={[styles.chipText, duration === d && styles.chipTextActive]}>{d}분</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 면접관 수 */}
      <Text style={styles.label}>면접관 수</Text>
      <View style={styles.row}>
        {INTERVIEWER_COUNT_OPTIONS.map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.chip, interviewerCount === n && styles.chipActive]}
            onPress={() => setInterviewerCount(n)}
          >
            <Text style={[styles.chipText, interviewerCount === n && styles.chipTextActive]}>
              {n}명
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 시작 버튼 */}
      <TouchableOpacity
        style={[styles.startBtn, loading && styles.startBtnDisabled]}
        onPress={handleStart}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.startBtnText}>면접 준비하기</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 32, fontWeight: "800", color: "#fff", marginTop: 48, marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 32 },
  label: { fontSize: 13, color: "#aaa", marginBottom: 8, marginTop: 20 },
  input: {
    backgroundColor: "#1a1a1a", borderRadius: 12, padding: 14,
    color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#2a2a2a",
  },
  uploadBtn: {
    backgroundColor: "#1a1a1a", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#2a2a2a", borderStyle: "dashed",
  },
  uploadText: { color: "#888", fontSize: 14 },
  row: { flexDirection: "row", gap: 10 },
  chip: {
    paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 999, backgroundColor: "#1a1a1a",
    borderWidth: 1, borderColor: "#2a2a2a",
  },
  chipActive: { backgroundColor: "#4f46e5", borderColor: "#4f46e5" },
  chipText: { color: "#888", fontSize: 14 },
  chipTextActive: { color: "#fff" },
  startBtn: {
    marginTop: 40, backgroundColor: "#4f46e5",
    borderRadius: 14, paddingVertical: 18, alignItems: "center",
  },
  startBtnDisabled: { opacity: 0.6 },
  startBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
