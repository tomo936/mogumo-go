#!/bin/bash
# いくつかの角度の画像を撮って 4 列に並べる（キリン）。使い方: sheet.sh <glb（/ で始める）> <出力 png> <大きさ px> "<名前:yaw:elev:見える高さ:x:y:z[:動き:時刻[:顔]]>;..."
H=$(cd "$(dirname "$0")" && pwd); O=${TMPDIR:-/tmp}/sheet-$$; mkdir -p $O; PX=$3
S=""; N=()
IFS=';' read -ra A <<< "$4"
for a in "${A[@]}"; do IFS=':' read -r n y e vh x yy z an t fa <<< "$a"; S="$S$n:$y:$e:$PX:$vh:$x:$yy:$z:$an:${t:-0}:${fa:-0};"; N+=("$n"); done
$H/cap.sh "glb=$1&what=shots&s=$S" $O > /dev/null
cd $O; args=(); f=""; i=0
for n in "${N[@]}"; do args+=(-i "$n.png"); f="$f[$i]drawtext=text='$n':fontsize=20:x=6:y=6:fontcolor=0x6b3f26[l$i];"; i=$((i+1)); done
while [ $((i % 4)) -ne 0 ]; do args+=(-f lavfi -i color=white:s=${PX}x${PX}:d=1); f="$f[$i]null[l$i];"; i=$((i+1)); done
r=$((i / 4)); rows=""
for k in $(seq 0 $((r-1))); do f="$f[l$((k*4))][l$((k*4+1))][l$((k*4+2))][l$((k*4+3))]hstack=4[r$k];"; rows="$rows[r$k]"; done
if [ $r -eq 1 ]; then V="[r0]null"; else V="${rows}vstack=$r"; fi
ffmpeg -v error -y "${args[@]}" -filter_complex "${f}${V}" -frames:v 1 "$2" && echo "saved $2"
cd /; rm -r $O
