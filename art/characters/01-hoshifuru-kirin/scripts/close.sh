#!/bin/bash
# 前回の不具合の所の拡大（1 枚 600px）を 4 列に並べる（2 回目。関門 2 と仕上げで使う）
# 使い方: close.sh <glb（/ で始める）> <出力 png> [動き] [時刻]
# 名前:yaw:elev:見える高さ:x:高さ:前後（前が +）
H=$(cd "$(dirname "$0")" && pwd); O=${TMPDIR:-/tmp}/close-$$; mkdir -p $O
A=${3:-}; T=${4:-0}
L="pack_back:180:10:0.32:0:0.4:-0.1;pack_edgeL:130:15:0.25:0.08:0.42:-0.08;pack_edgeR:230:15:0.25:-0.08:0.42:-0.08;pack_under:180:-25:0.25:0:0.3:-0.1;neck_back:180:25:0.18:0:0.52:-0.04;neck_backL:140:30:0.18:0.03:0.52:-0.02;calf_back:180:0:0.2:0:0.1:0;calf_front:0:0:0.2:0:0.1:0;calf_inR:300:0:0.2:0:0.1:0;shoes:30:40:0.16:0:0.04:0;shoes_back:180:20:0.16:0:0.04:0;hands:0:0:0.16:-0.27:0.29:0;handL_back:180:0:0.16:0.27:0.29:0;neck_front:0:0:0.16:0:0.55:0;chin_up:0:-35:0.16:0:0.56:0;eyes:0:0:0.14:0:0.66:0"
S=""; N=()
IFS=';' read -ra AR <<< "$L"
for a in "${AR[@]}"; do IFS=':' read -r n y e vh x yy z <<< "$a"; S="$S$n:$y:$e:600:$vh:$x:$yy:$z:$A:$T;"; N+=("$n"); done
$H/cap.sh "glb=$1&what=shots&s=$S" $O
cd $O; args=(); f=""; i=0
for n in "${N[@]}"; do args+=(-i "$n.png"); f="$f[$i]drawtext=text='$n':fontsize=24:x=8:y=8:fontcolor=0x6b3f26[l$i];"; i=$((i+1)); done
r=$((i / 4)); rows=""
for k in $(seq 0 $((r-1))); do f="$f[l$((k*4))][l$((k*4+1))][l$((k*4+2))][l$((k*4+3))]hstack=4[r$k];"; rows="$rows[r$k]"; done
ffmpeg -v error -y "${args[@]}" -filter_complex "${f}${rows}vstack=$r" -frames:v 1 "$2" && echo "saved $2"
cd /; rm -rf $O
