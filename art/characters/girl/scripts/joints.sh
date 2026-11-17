#!/bin/bash
# 関節の拡大（1 枚 500px）を撮って 4 列に並べる。使い方: joints.sh <glb> <動き> <出力 png> "<名前:yaw:elev:見える高さ:x:y:z:時刻>;..."
H=$(cd "$(dirname "$0")" && pwd); O=${TMPDIR:-/tmp}/joints-$$; mkdir -p $O
S=""; N=()
IFS=';' read -ra A <<< "$4"
for a in "${A[@]}"; do IFS=':' read -r n y e vh x yy z t <<< "$a"; S="$S$n:$y:$e:500:$vh:$x:$yy:$z:$2:$t;"; N+=("$n"); done
$H/cap.sh "glb=$1&what=shots&s=$S" $O
cd $O; args=(); f=""; i=0
for n in "${N[@]}"; do args+=(-i "$n.png"); f="$f[$i]drawtext=text='$n':fontsize=22:x=8:y=8:fontcolor=0x6b3f26[l$i];"; i=$((i+1)); done
while [ $((i % 4)) -ne 0 ]; do args+=(-f lavfi -i color=white:s=500x500:d=1); f="$f[$i]null[l$i];"; i=$((i+1)); done
r=$((i / 4)); rows=""
for k in $(seq 0 $((r-1))); do f="$f[l$((k*4))][l$((k*4+1))][l$((k*4+2))][l$((k*4+3))]hstack=4[r$k];"; rows="$rows[r$k]"; done
if [ $r -eq 1 ]; then V="[r0]null"; else V="${rows}vstack=$r"; fi
ffmpeg -v error -y "${args[@]}" -filter_complex "${f}${V}" -frames:v 1 "$3" && echo "saved $3"
