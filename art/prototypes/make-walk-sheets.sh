#!/usr/bin/env bash
# 男の子の歩く絵（art/characters/boy-walk/<向き>/frame-01〜21.png, 245x472）を、
# アプリ用に高さ 120px へ縮め、21コマを横に並べた透明つき webp（1向き1枚）にする。
# 出力: src/assets/characters/boy-walk/<向き>.webp（幅 62px x 21コマ = 1302 x 120）
# 使い方: bash art/prototypes/make-walk-sheets.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=src/assets/characters/boy-walk
mkdir -p "$OUT"
for dir in front front-left left back-left back back-right right front-right; do
  ffmpeg -y -loglevel error -framerate 1 -i "art/characters/boy-walk/$dir/frame-%02d.png" \
    -vf "scale=62:120:flags=lanczos,format=rgba,tile=21x1" -frames:v 1 \
    -c:v libwebp -lossless 0 -quality 80 -pix_fmt yuva420p "$OUT/$dir.webp"
done
ls -l "$OUT"
