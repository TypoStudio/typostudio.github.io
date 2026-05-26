#!/usr/bin/env bash
# 변경사항을 커밋하고 master에 push하면 GitHub Pages가 자동 배포한다.
set -euo pipefail

cd "$(dirname "$0")"

# 커밋 메시지: 인자로 받거나 타임스탬프 사용
MSG="${1:-deploy: $(date '+%Y-%m-%d %H:%M:%S')}"

# 변경사항이 없으면 종료
if [ -z "$(git status --porcelain)" ]; then
  echo "변경사항이 없습니다."
  exit 0
fi

git add -A
git commit -m "$MSG"
git push origin master

echo "✅ push 완료. GitHub Pages 배포가 곧 시작됩니다."
