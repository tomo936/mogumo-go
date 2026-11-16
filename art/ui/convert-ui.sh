#!/bin/bash
# 地図の画面の丸ボタン・気配・コインを、アプリ用の小さい WebP（透過）にする。使い方: bash art/ui/convert-ui.sh
# 表示の大きさの 3 倍までに縮める（丸ボタン 7 点と気配は 192px、コインは 96px）。
set -e
cd "$(dirname "$0")/../.."
out=src/assets/ui
conv() { ffmpeg -y -loglevel error -i "$1" -vf "scale=$3:$3:flags=lanczos" -c:v libwebp -lossless 0 -quality 85 -compression_level 6 "$out/$2.webp"; }
conv art/ui/menu/btn-record-v4.png btn-record 192
conv art/ui/menu/btn-collection-v4.png btn-collection 192
conv art/ui/menu/btn-gacha-v10.png btn-gacha 192
conv art/ui/menu/btn-mypage-v4.png btn-mypage 192
conv art/ui/menu/btn-settings-v4.png btn-settings 192
conv art/ui/menu/btn-cloche-v4.png btn-cloche 192
conv art/ui/menu/icon-close-v2.png icon-close 192
conv art/ui/menu/kehai-icon-cloud.png kehai-cloud 192
conv art/ui/coin/gourmet-coin.png gourmet-coin 96
ffmpeg -y -loglevel error -i art/ui/menu/compass.png -vf "crop=388:388:62:62,scale=192:192:flags=lanczos" -c:v libwebp -lossless 0 -quality 85 -compression_level 6 "$out/compass.webp"  # 方位磁針（絵のまわりの余白を切る）
ffmpeg -y -loglevel error -i art/ui/title.png -c:v libwebp -quality 80 -compression_level 6 "$out/title.webp"  # タイトル画面（起動時のスプラッシュの背景。852×1846）
# ローディングのパンケーキ（ミシェーラ 2026-11-14 採用。PNG 連番 art/loading/loading-pancake-regen6-frames.zip を展開した alpha_seq_regen6/ から、幅 128px・30fps のアニメ WebP に）
# ffmpeg -y -framerate 30 -i alpha_seq_regen6/%03d.png -vf "scale=128:-1:flags=lanczos,format=yuva420p" -c:v libwebp -lossless 0 -quality 60 -loop 0 "$out/loading-pancake.webp"
# アプリアイコン（ミシェーラ appicon-kuma-v1.png。絵は変えず縮小だけ）→ public/
for s in 32 192; do ffmpeg -y -loglevel error -i art/branding/appicon-kuma-v1.png -vf "scale=$s:$s:flags=lanczos" public/icon-$s.png; done
ffmpeg -y -loglevel error -i art/branding/appicon-kuma-v1.png -vf "scale=180:180:flags=lanczos" public/apple-touch-icon.png
python3 -I art/loading/webp-noblend.py "$out/loading-pancake.webp"  # iPhone でコマが重ならないように（上の ffmpeg のあと必ず）
