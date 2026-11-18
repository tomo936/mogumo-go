#!/bin/bash
# ホーム画面から開いたとき（standalone）の起動画像と 512px のアイコンを作る。使い方: bash art/prototypes/startup-images.sh
# 起動画像はタイトルと同じ見た目（背景を下そろえで画面いっぱい・ロゴを上から約 15%）。機種ごとの大きさは index.html の media と同じ。
# 2026-11-18 オーナー「ホーム画面から開くとアドレスバーが出る・開く瞬間の白い画面」
set -e
cd "$(dirname "$0")/../.."
ffmpeg -y -loglevel error -i art/branding/appicon-kuma-v1.png -vf "scale=512:512:flags=lanczos" public/icon-512.png
out=public/startup
mkdir -p "$out"
# 幅pt 高さpt 倍率
while read -r w h r; do
  W=$((w * r)); H=$((h * r))
  bar=$((54 * r))                  # 上の時計の帯（この高さの下からがページ）
  lw=$(( (w * 84 / 100 < 420 ? w * 84 / 100 : 420) * r ))  # ロゴの幅 = min(84vw, 420px)
  ly=$(( bar + (H - bar) * 15 / 100 ))
  ffmpeg -y -loglevel error -i art/ui/title-v2.png -i art/branding/logo.png -filter_complex \
    "[0]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}:(iw-${W})/2:ih-${H}[bg];[1]scale=${lw}:-1:flags=lanczos[lg];[bg][lg]overlay=(W-w)/2:${ly}" \
    -q:v 3 "$out/startup-${W}x${H}.jpg"
done <<'LIST'
440 956 3
430 932 3
402 874 3
393 852 3
428 926 3
390 844 3
414 896 3
375 812 3
414 896 2
414 736 3
375 667 2
LIST
