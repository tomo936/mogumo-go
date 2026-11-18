#!/bin/bash
# 関門 1 の画像: 参考の三面図と、形の 正面・右横・後ろ・斜め上・真上、手の内側・わきの拡大を 1 枚に
# 4 行目: わき（後ろ）・股の正面・股の後ろ・股を下から（両足が股から下で離れているか。2 回目）
# 使い方: gate1-views.sh <glb（リポジトリの根からのパス、/ で始める）> <出力 png>
H=$(cd "$(dirname "$0")" && pwd)
O=${TMPDIR:-/tmp}/g1views; mkdir -p $O
S="front:0:0:400:1.1:0:0.5:0;right:90:0:400:1.1:0:0.5:0;back:180:0:400:1.1:0:0.5:0;oblique:30:40:400:1.1:0:0.5:0;top:0:89:400:1.1:0:0.5:0;handR_in:270:0:400:0.25:-0.27:0.32:0:::0:0.9;handL_in:90:0:400:0.25:0.27:0.32:0:::0:0.9;pitR:0:0:400:0.3:-0.15:0.38:0;pitL_back:180:0:400:0.3:0.15:0.38:0;crotchF:0:0:400:0.25:0:0.12:0;crotchB:180:0:400:0.25:0:0.12:0;crotchUp:0:-30:400:0.25:0:0.12:0"
$H/cap.sh "glb=$1&what=shots&s=$S" $O
R=/home/otosa/mogumo-go/art/prototypes/avatar/input; P=${3:-apose2}  # 参考の絵の接頭辞（2 回目: apose2）
cd $O && ffmpeg -v error -y -i $R/$P-front-rgba.png -i $R/$P-side-rgba.png -i $R/$P-back-rgba.png -i front.png -i right.png -i back.png -i oblique.png -i top.png -i handR_in.png -i handL_in.png -i pitR.png -i pitL_back.png -i crotchF.png -i crotchB.png -i crotchUp.png -filter_complex "color=white:s=400x400[w];[0]scale=400:400[a0];[1]scale=400:400[a1];[2]scale=400:400[a2];[w][a0]overlay[b0];color=white:s=400x400[w1];[w1][a1]overlay[b1];color=white:s=400x400[w2];[w2][a2]overlay[b2];color=white:s=400x400[w3];[b0][b1][b2][w3]hstack=4[r0];[3][4][5][6]hstack=4[r1];[7][8][9][10]hstack=4[r2];[11][12][13][14]hstack=4[r3];[r0][r1][r2][r3]vstack=4" -frames:v 1 "$2" && echo "saved $2"
