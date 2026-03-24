/**
 * GLB 아바타 파일 — S3에서 다운로드 후 로컬 캐싱
 *
 * 전략:
 *   1. 로컬 캐시 파일이 있으면 즉시 반환 (캐시 히트)
 *   2. 없으면 S3 URL에서 다운로드 → cacheDirectory에 저장
 *   3. 반환값은 로컬 file:// URI → Three.js GLTFLoader에 직접 전달 가능
 */
import * as FileSystem from "expo-file-system";

const AVATAR_CACHE_DIR = `${FileSystem.cacheDirectory}avatars/`;

async function ensureCacheDir() {
  const info = await FileSystem.getInfoAsync(AVATAR_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AVATAR_CACHE_DIR, { intermediates: true });
  }
}

/**
 * @param avatarId  면접관 ID (예: "interviewer_1")
 * @param remoteUrl S3의 .glb URL
 * @returns         로컬 파일 URI (file://...)
 */
export async function loadAvatarGlb(avatarId: string, remoteUrl: string): Promise<string> {
  await ensureCacheDir();

  const localPath = `${AVATAR_CACHE_DIR}${avatarId}.glb`;
  const info = await FileSystem.getInfoAsync(localPath);

  if (info.exists) {
    return localPath; // 캐시 히트
  }

  // S3에서 다운로드
  const download = await FileSystem.downloadAsync(remoteUrl, localPath);
  if (download.status !== 200) {
    throw new Error(`GLB 다운로드 실패: ${download.status} — ${remoteUrl}`);
  }

  return localPath;
}

/** 캐시 전체 삭제 (업데이트 시 사용) */
export async function clearAvatarCache() {
  const info = await FileSystem.getInfoAsync(AVATAR_CACHE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(AVATAR_CACHE_DIR, { idempotent: true });
  }
}
