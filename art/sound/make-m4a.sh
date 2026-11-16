#!/usr/bin/env bash
# 試聴用: art/sound/sfx/*.wav → *.m4a（iPhone で聞ける）と、全部を 1 秒あけてつないだ all.m4a
set -euo pipefail
cd "$(dirname "$0")/sfx"
for f in 0*.wav; do ffmpeg -loglevel error -y -i "$f" -c:a aac -b:a 128k "${f%.wav}.m4a"; done
list=$(mktemp)
ffmpeg -loglevel error -y -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -c:a pcm_s16le gap.wav
for f in 0*.wav; do echo "file '$PWD/$f'" >>"$list"; echo "file '$PWD/gap.wav'" >>"$list"; done
ffmpeg -loglevel error -y -f concat -safe 0 -i "$list" -c:a aac -b:a 128k all.m4a
rm -f gap.wav "$list"
ls -la *.m4a
