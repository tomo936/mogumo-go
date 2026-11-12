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
