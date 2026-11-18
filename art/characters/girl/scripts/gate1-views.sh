#!/bin/bash
# 関門 1 の画像（女の子）: 参考の絵と、形の 正面・右横・後ろ・斜め上・真上、手の内側・わき・股、ツインテールと肩・リュックの拡大
# 使い方: gate1-views.sh <glb（リポジトリの根からのパス、/ で始める）> <出力 png>
H=$(cd "$(dirname "$0")" && pwd)
O=${TMPDIR:-/tmp}/g1views-girl; rm -rf $O; mkdir -p $O
S="front:0:0:400:1.1:0:0.5:0;right:90:0:400:1.1:0:0.5:0;back:180:0:400:1.1:0:0.5:0;oblique:30:40:400:1.1:0:0.5:0;top:0:89:400:1.1:0:0.5:0;handR_in:270:0:400:0.25:-0.25:0.3:0:::0:0.9;handL_in:90:0:400:0.25:0.25:0.3:0:::0:0.9;pitR:0:0:400:0.3:-0.15:0.34:0;pitL_back:180:0:400:0.3:0.15:0.34:0;crotchF:0:0:400:0.25:0:0.15:0;crotchUp:0:-30:400:0.25:0:0.15:0;twinR_side:90:0:400:0.35:-0.2:0.5:0;twinL_side:270:0:400:0.35:0.2:0.5:0;twin_back:180:20:400:0.4:0:0.5:0;twinR_up:120:-20:400:0.3:-0.2:0.5:0;twinL_obl:210:40:400:0.4:0.1:0.5:0"
$H/cap.sh "glb=$1&what=shots&s=$S" $O
R=/home/otosa/mogumo-go/art/characters/girl/input; P=girl
cd $O && ffmpeg -v error -y -i $R/$P-front-rgba.png -i $R/$P-side-rgba.png -i $R/$P-back-rgba.png -i front.png -i right.png -i back.png -i oblique.png -i top.png -i handR_in.png -i handL_in.png -i pitR.png -i pitL_back.png -i crotchF.png -i crotchUp.png -i twinR_side.png -i twinL_side.png -i twin_back.png -i twinR_up.png -i twinL_obl.png -filter_complex "color=white:s=400x400[w];[0]scale=400:400[a0];[1]scale=400:400[a1];[2]scale=400:400[a2];[w][a0]overlay[b0];color=white:s=400x400[w1];[w1][a1]overlay[b1];color=white:s=400x400[w2];[w2][a2]overlay[b2];color=white:s=400x400[w3];[b0][b1][b2][w3]hstack=4[r0];[3][4][5][6]hstack=4[r1];[7][8][9][10]hstack=4[r2];[11][12][13][14]hstack=4[r3];[15][16][17][18]hstack=4[r4];[r0][r1][r2][r3][r4]vstack=5" -frames:v 1 "$2" && echo "saved $2"
