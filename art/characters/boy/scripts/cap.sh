#!/bin/bash
# 使い方: cap.sh <ページの ? 以降> <出力フォルダ>。vite を立てて撮って止める
cd /home/otosa/mogumo-go
npx vite --config art/characters/boy/scripts/vite.cap.config.mjs > ${TMPDIR:-/tmp}/vite-cap.log 2>&1 &
VP=$!
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:5199/ && break; sleep 0.5; done
PLAYWRIGHT_BROWSERS_PATH=/home/otosa/tools/browsers node art/characters/boy/scripts/cap.mjs "http://localhost:5199/.superpowers/preview/avatar/boy.html?$1" "$2" 2>&1 | grep -v '\[vite\]' | head -20
kill $VP
