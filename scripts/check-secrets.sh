#!/usr/bin/env bash
# コミット前のキー混入チェック（上司課題資料4章の「機械で検査する仕組み」）
# 使い方: git config core.hooksPath scripts/hooks で有効化される pre-commit から呼ばれる
set -euo pipefail

# 単語（service_role などのロール名）ではなく「キーの値」に反応させる【2026-11-05 誤検知のため修正】
#   1. Supabase の秘密キー（sb_secret_…）
#   2. JWT 形式のキー（旧 service_role / anon キーなど。eyJ….eyJ….）
#   3. 変数への代入（SERVICE_ROLE_KEY=… / HOTPEPPER_API_KEY=… / SECRET_KEY=… など、値が16文字以上）
#   4. api_key: "…" の形の代入
#   5. URL のクエリに付いたキー（ホットペッパーの ?key=…）
#   6. 秘密鍵ファイルの中身
PATTERNS='(sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}|(SERVICE_ROLE|SERVICE|SECRET|HOTPEPPER)[A-Z_]*KEY\s*[:=]\s*["'\'']?[A-Za-z0-9_\-]{16,}|api[_-]?key\s*[:=]\s*["'\''][A-Za-z0-9_\-]{16,}|[?&]key=[A-Za-z0-9]{16,}|-----BEGIN (RSA |EC )?PRIVATE KEY-----)'

STAGED=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$STAGED" ] && exit 0

FOUND=0
for f in $STAGED; do
  case "$f" in
    .env.example) continue ;;
    .env|.env.*) echo "NG: $f はコミット対象に含まれています（.env はコミット禁止）"; FOUND=1; continue ;;
  esac
  if git show ":$f" 2>/dev/null | grep -En "$PATTERNS" >/dev/null; then
    echo "NG: $f にキーらしき文字列があります:"
    git show ":$f" | grep -En "$PATTERNS" | head -5
    FOUND=1
  fi
done

if [ "$FOUND" -ne 0 ]; then
  echo "コミットを中止しました。キーを .env へ移し、ソースから除いてください。"
  exit 1
fi
exit 0
