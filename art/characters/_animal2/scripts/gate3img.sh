#!/bin/bash
# 関門 3 の画像: 試しの姿勢の並べ（行 = 姿勢、列 = 6 方向。1 こま 105px）＋関節の拡大（300px × 8 枚を 4 列）
# 使い方: gate3img.sh <キャラのフォルダ（リポジトリの根から）> <姿勢の数>。拡大の場所は <キャラ>/config.json の gate3.close（名前:yaw:elev:見える高さ:x:高さ:前後:姿勢の番号 を ; でつなぐ）
CH=$1; N=$2; K=/home/otosa/mogumo-go/art/characters/01-hoshifuru-kirin/scripts
cd /home/otosa/mogumo-go; O=$(mktemp -d art/characters/_animal2/.cap-XXXX); G=/$CH/work/gate3.glb
$K/cap.sh "glb=$G&what=posegrid&anim=gate3&n=$N&t=105" $O > /dev/null 2>&1
cp $O/pose-gate3.png $CH/gate/gate3-poses.png && echo "saved $CH/gate/gate3-poses.png"
L=$(python3 -c "import json;print(json.load(open('$CH/config.json'))['gate3']['close'])")
S=""; NM=()
IFS=';' read -ra A <<< "$L"
for a in "${A[@]}"; do IFS=':' read -r n y e vh x yy z i <<< "$a"; S="$S$n:$y:$e:300:$vh:$x:$yy:$z:gate3:$(python3 -c "print($i/30+0.001)");"; NM+=("$n"); done
$K/cap.sh "glb=$G&what=shots&s=$S" $O > /dev/null 2>&1
args=(); f=""; i=0
for n in "${NM[@]}"; do args+=(-i "$O/$n.png"); f="$f[$i]drawtext=text='$n':fontsize=18:x=6:y=6:fontcolor=0x6b3f26[l$i];"; i=$((i+1)); done
while [ $((i % 4)) -ne 0 ]; do args+=(-f lavfi -i color=white:s=300x300:d=1); f="$f[$i]null[l$i];"; i=$((i+1)); done
r=$((i / 4)); rows=""
for k in $(seq 0 $((r-1))); do f="$f[l$((k*4))][l$((k*4+1))][l$((k*4+2))][l$((k*4+3))]hstack=4[r$k];"; rows="$rows[r$k]"; done
if [ $r -eq 1 ]; then V="[r0]null"; else V="${rows}vstack=$r"; fi
ffmpeg -v error -y "${args[@]}" -filter_complex "${f}${V}" -frames:v 1 $CH/gate/gate3-joints.png && echo "saved $CH/gate/gate3-joints.png"
rm -rf $O
