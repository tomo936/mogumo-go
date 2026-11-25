#!/bin/bash
# 関門 1 の画像（キリン）: 参考の絵と、形の 正面・右横・後ろ・斜め上・真上、角と星・耳・しっぽ・わきとリュック・手・股の拡大
# 使い方: gate1-views.sh <glb（リポジトリの根からのパス、/ で始める）> <出力 png>
# 名前:yaw:elev:px:見える高さ:x:y(高さ):z(前が +)
H=/home/otosa/mogumo-go/art/characters/01-hoshifuru-kirin/scripts
O=${TMPDIR:-/tmp}/g1views-neko; rm -rf $O; mkdir -p $O
S="front:0:0:400:1.1:0:0.5:0;right:90:0:400:1.1:0:0.5:0;back:180:0:400:1.1:0:0.5:0;oblique:30:40:400:1.1:0:0.5:0;tail_side:90:0:400:0.5:0:0.4:-0.2;tail_back:180:10:400:0.5:0:0.4:-0.15;tail_top:150:50:400:0.5:0:0.4:-0.15;pack_side:270:10:400:0.45:0.1:0.4:0;pitR_f:0:0:400:0.3:-0.17:0.4:0;pitL_back:180:0:400:0.3:0.17:0.4:0;handR:270:0:400:0.25:-0.22:0.3:0;crotchF:0:0:400:0.25:0:0.12:0"
$H/cap.sh "glb=$1&what=shots&s=$S" $O
R=/home/otosa/mogumo-go/art/characters/05-ichigo-milk-neko/input; P=neko
N=(front right back oblique tail_side tail_back tail_top pack_side pitR_f pitL_back handR crotchF)
cd $O && args=(-i $R/$P-front-rgba.png -i $R/$P-side-rgba.png -i $R/$P-back-rgba.png); f="color=white:s=400x400[w0];color=white:s=400x400[w1];color=white:s=400x400[w2];color=white:s=400x400[w3];[0]scale=400:400[a0];[1]scale=400:400[a1];[2]scale=400:400[a2];[w0][a0]overlay[b0];[w1][a1]overlay[b1];[w2][a2]overlay[b2];[b0][b1][b2][w3]hstack=4[r0];"
i=3; for n in "${N[@]}"; do args+=(-i $n.png); f="$f[$i]drawtext=text='$n':fontsize=20:x=6:y=6:fontcolor=0x6b3f26[l$i];"; i=$((i+1)); done
rows="[r0]"; k=1; for j in $(seq 3 4 $((i-1))); do f="$f[l$j][l$((j+1))][l$((j+2))][l$((j+3))]hstack=4[r$k];"; rows="$rows[r$k]"; k=$((k+1)); done
ffmpeg -v error -y "${args[@]}" -filter_complex "${f}${rows}vstack=$k" -frames:v 1 "$2" && echo "saved $2"
