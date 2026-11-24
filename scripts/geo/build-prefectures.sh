#!/usr/bin/env bash
# 国土数値情報 N03（行政区域）から都道府県の形（public/geo/prefectures.json）を作る。
# 使い方: scripts/geo/build-prefectures.sh [作業フォルダ]   （作業フォルダは約 1.5GB 空きが要る）
# 必要: node / npm / curl / python3。展開物の中のプログラムは実行しない。
set -euo pipefail
YEAR="${N03_YEAR:-2026}"
SIMPLIFY="${SIMPLIFY:-0.1%}"        # 細かさ。大きくすると軽くなる
MIN_AREA="${MIN_AREA:-30000000}"     # これ未満（m²、30km²）の離島は落とす
WORK="${1:-$(mktemp -d)}"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/geo/prefectures.json"
URL="https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-${YEAR}/N03-${YEAR}0101_GML.zip"
mkdir -p "$WORK/src" "$WORK/tools"
if [ ! -f "$WORK/src/N03-${YEAR}0101_prefecture.shp" ]; then
  curl -fL -o "$WORK/n03.zip" "$URL"
  python3 -I -c "
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1])
for n in z.namelist():
    if n.startswith('N03-${YEAR}0101_prefecture.') and n.endswith(('.shp','.dbf','.shx','.prj','.cpg')): z.extract(n,sys.argv[2])
" "$WORK/n03.zip" "$WORK/src"
  rm -f "$WORK/n03.zip"
fi
(cd "$WORK/tools" && npm install --cache "$WORK/npmcache" --no-audit --no-fund mapshaper@0.8.9 >/dev/null 2>&1 || npm install --cache "$WORK/npmcache" --no-audit --no-fund mapshaper >/dev/null)
NODE_OPTIONS=--max-old-space-size=3500 "$WORK/tools/node_modules/.bin/mapshaper" \
  -i "$WORK/src/N03-${YEAR}0101_prefecture.shp" encoding=utf8 \
  -each 'code = N03_007.slice(0,2), name = N03_001' \
  -dissolve code copy-fields=name \
  -simplify visvalingam "$SIMPLIFY" keep-shapes \
  -filter-islands min-area="$MIN_AREA" remove-empty \
  -filter-fields code,name \
  -sort code \
  -o "$OUT" format=geojson precision=0.0001
ls -l "$OUT"
