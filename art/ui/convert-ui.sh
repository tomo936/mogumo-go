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
# メニューの丸（2026-11-18 オーナー: クローシュ → フォークとスプーンのお皿。元の絵は角が白いので、お皿の外（中心 797,793・半径 680〜686px）を透明にしてから縮める）
ffmpeg -y -loglevel error -i art/ui/menu/btn-menu-plate.png -vf "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*clip((686-hypot(X-797,Y-793))/6,0,1)',scale=192:192:flags=lanczos" -c:v libwebp -lossless 0 -quality 85 -compression_level 6 "$out/btn-cloche.webp"
conv art/ui/menu/icon-close-v2.png icon-close 192
conv art/ui/menu/kehai-icon-cloud.png kehai-cloud 192
conv art/ui/coin/gourmet-coin.png gourmet-coin 96
# 右上の 3 つのボタン（2026-11-18 オーナー。丸い絵は最初から透明の角つき）
conv art/ui/menu/btn-nearby.png btn-nearby 192
conv art/ui/menu/btn-inbox.png btn-inbox 192
# 方位磁針: 土台は動かさず、針だけが回る。針は土台の 62% に縮めて、同じ 192px の四角の真ん中に置く
conv art/ui/menu/compass-plate.png compass 192
ffmpeg -y -loglevel error -i art/ui/menu/compass-needle.png -vf "scale=119:119:flags=lanczos,format=rgba,pad=192:192:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -c:v libwebp -lossless 0 -quality 85 -compression_level 6 "$out/compass-needle.webp"
ffmpeg -y -loglevel error -i art/ui/title-v2.png -c:v libwebp -quality 80 -compression_level 6 "$out/title.webp" && cp "$out/title.webp" public/boot/title.webp  # タイトル画面（起動直後の #boot とスプラッシュの背景。852×1846。2026-11-18 オーナー: title-v2.png に差し替え）
# ローディングのパンケーキ（ミシェーラ 2026-11-14 採用。PNG 連番 art/loading/loading-pancake-regen6-frames.zip を展開した alpha_seq_regen6/ から、幅 128px・30fps のアニメ WebP に）
# ffmpeg -y -framerate 30 -i alpha_seq_regen6/%03d.png -vf "scale=128:-1:flags=lanczos,format=yuva420p" -c:v libwebp -lossless 0 -quality 60 -loop 0 "$out/loading-pancake.webp"
# アプリアイコン（ミシェーラ appicon-kuma-v1.png。絵は変えず縮小だけ）→ public/
for s in 32 192; do ffmpeg -y -loglevel error -i art/branding/appicon-kuma-v1.png -vf "scale=$s:$s:flags=lanczos" public/icon-$s.png; done
ffmpeg -y -loglevel error -i art/branding/appicon-kuma-v1.png -vf "scale=180:180:flags=lanczos" public/apple-touch-icon.png
python3 -I art/loading/webp-noblend.py "$out/loading-pancake.webp"  # iPhone でコマが重ならないように（上の ffmpeg のあと必ず）
# ロゴ（オーナー 2026-11-16）: ほぼ透明の点（アルファ 24 未満）を消して、うっすら四角い枠が見えないように。可逆の WebP
ffmpeg -y -i art/branding/logo.png -vf "format=rgba,scale=720:-1:flags=lanczos,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(alpha(X,Y),24),0,alpha(X,Y))'" -c:v libwebp -lossless 1 -compression_level 6 "$out/logo.webp"
# ログインボーナスのパネル（ミシェーラ 2026-11-16 受領。A4）: 幅 840px の WebP（アルファあり）
ffmpeg -y -loglevel error -i art/ui/login-bonus-panel.png -vf "scale=840:-1:flags=lanczos" -c:v libwebp -lossless 0 -quality 82 -compression_level 6 "$out/login-bonus-panel.webp"
