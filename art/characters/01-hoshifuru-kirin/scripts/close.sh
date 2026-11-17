#!/bin/bash
# キリンの拡大（1 枚 600px）を 4 列に並べる: わき・手・肩ひも・リュックの上・首輪・耳・角・しっぽ・足。CLOSE_L で場所を替えられる
# 使い方: close.sh <glb（/ で始める）> <出力 png> [動き] [時刻]
# 名前:yaw:elev:見える高さ:x:高さ:前後（前が +）
H=$(cd "$(dirname "$0")" && pwd); O=${TMPDIR:-/tmp}/close-$$; mkdir -p $O
A=${3:-}; T=${4:-0}
L=${CLOSE_L:-"pitR_f:0:0:0.25:-0.17:0.34:0;pitL_back:180:0:0.25:0.17:0.34:0;handR:330:10:0.18:-0.23:0.29:0;handL_in:90:0:0.18:0.2:0.29:0;strapR:300:20:0.25:-0.12:0.44:0;strapL_back:120:20:0.25:0.12:0.44:-0.05;pack_top:180:30:0.25:0:0.5:-0.1;collar:0:10:0.2:0:0.47:0;earL:330:10:0.25:0.24:0.79:0;earR_back:200:10:0.25:-0.24:0.79:0;horns:0:10:0.3:0:0.9:0;horns_back:160:30:0.3:0:0.9:0;tail_root:120:0:0.2:0:0.19:-0.12;tail_top:180:45:0.3:0:0.22:-0.15;feet:30:40:0.22:0:0.05:0;crotch_back:180:-10:0.25:0:0.12:0"}
S=""; N=()
IFS=';' read -ra AR <<< "$L"
for a in "${AR[@]}"; do IFS=':' read -r n y e vh x yy z <<< "$a"; S="$S$n:$y:$e:600:$vh:$x:$yy:$z:$A:$T;"; N+=("$n"); done
$H/cap.sh "glb=$1&what=shots&s=$S" $O
cd $O; args=(); f=""; i=0
for n in "${N[@]}"; do args+=(-i "$n.png"); f="$f[$i]drawtext=text='$n':fontsize=24:x=8:y=8:fontcolor=0x6b3f26[l$i];"; i=$((i+1)); done
r=$((i / 4)); rows=""
for k in $(seq 0 $((r-1))); do f="$f[l$((k*4))][l$((k*4+1))][l$((k*4+2))][l$((k*4+3))]hstack=4[r$k];"; rows="$rows[r$k]"; done
if [ $r -eq 1 ]; then V="[r0]null"; else V="${rows}vstack=$r"; fi
ffmpeg -v error -y "${args[@]}" -filter_complex "${f}${V}" -frames:v 1 "$2" && echo "saved $2"
cd /; rm -rf $O
