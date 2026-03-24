#!/usr/bin/env bash
# ============================================================
# Ready Player Me GLB 경량화 스크립트 (빌드 타임에 1회 실행)
#
# 의존성:
#   npm install -g @gltf-transform/cli
#
# 사용법:
#   bash scripts/optimize-avatar.sh assets/avatars/raw/
#
# 결과:
#   assets/avatars/raw/interviewer_1.glb  (원본 ~15~40MB)
#   assets/avatars/interviewer_1.glb      (경량화 ~4~8MB)
# ============================================================

set -euo pipefail

RAW_DIR="${1:-assets/avatars/raw}"
OUT_DIR="frontend/assets/avatars"

if ! command -v gltf-transform &>/dev/null; then
  echo "gltf-transform이 설치되어 있지 않습니다."
  echo "설치: npm install -g @gltf-transform/cli"
  exit 1
fi

mkdir -p "$OUT_DIR"

for id in 1 2 3; do
  INPUT="$RAW_DIR/interviewer_${id}.glb"
  OUTPUT="$OUT_DIR/interviewer_${id}.glb"

  if [ ! -f "$INPUT" ]; then
    echo "[SKIP] $INPUT 파일 없음"
    continue
  fi

  echo "[최적화] interviewer_${id}.glb ..."

  gltf-transform optimize "$INPUT" "$OUTPUT" \
    --texture-compress webp \
    --simplify \
    --weld \
    --flatten \
    --join

  ORIG=$(du -sh "$INPUT" | cut -f1)
  COMP=$(du -sh "$OUTPUT" | cut -f1)
  echo "  완료: $ORIG → $COMP"
done

echo ""
echo "경량화 완료. 이제 $OUT_DIR 의 파일을 S3에 업로드하세요:"
echo "  aws s3 cp $OUT_DIR s3://myonterview-assets/avatars/ --recursive"
echo ""
echo ".env에 URL 추가:"
for id in 1 2 3; do
  echo "  EXPO_PUBLIC_AVATAR_URL_${id}=https://myonterview-assets.s3.ap-northeast-2.amazonaws.com/avatars/interviewer_${id}.glb"
done
