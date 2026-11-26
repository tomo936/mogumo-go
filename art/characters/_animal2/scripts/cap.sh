#!/bin/bash
# 撮影（「動物の二本足」型）: cap.sh <ページの ? 以降> <出力フォルダ>。vite を立てて cap-page.ts を開き、撮って止める（キリンの cap.mjs・vite の設定を使う）
cd /home/otosa/mogumo-go
K=art/characters/01-hoshifuru-kirin/scripts
npx vite --config $K/vite.cap.config.mjs > ${TMPDIR:-/tmp}/vite-cap-a2.log 2>&1 &
VP=$!
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:5198/ && break; sleep 0.5; done
PLAYWRIGHT_BROWSERS_PATH=/home/otosa/tools/browsers node $K/cap.mjs "http://localhost:5198/art/characters/_animal2/scripts/cap.html?$1" "$2" 2>&1 | grep -v '\[vite\]' | head -20
kill $VP
