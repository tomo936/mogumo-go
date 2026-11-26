#!/bin/bash
# 関門 2 の並べ画像（1200×600）: 上の行 = 元の絵（正面・横・後ろ）＋小さく（40px・16px を 4 倍、斜め上の前）、下の行 = 塗り直した形の 4 方向
# 使い方: gate2img.sh <キャラのフォルダ（リポジトリの根から）> <元の絵の名前の頭（例 arms2）>
CH=$1; R=$CH/ref/$2; A=/home/otosa/mogumo-go/art/characters/_animal2/scripts; K=/home/otosa/mogumo-go/art/characters/01-hoshifuru-kirin/scripts
cd /home/otosa/mogumo-go; O=$(mktemp -d art/characters/_animal2/.cap-XXXX)
$A/views.sh /$CH/work/stage2.glb $O/row2.png 300 > /dev/null
$K/cap.sh "glb=/$CH/work/stage2.glb&what=shots&s=s40:30:40:44:1.12:0:0.5:0;s16:30:40:18:1.12:0:0.5:0&bg=%23fbf0d9" $O > /dev/null 2>&1
ffmpeg -v error -y -i $R-front.png -i $R-side.png -i $R-back.png -i $O/s40.png -i $O/s16.png -filter_complex \
 "[0]scale=300:300[a];[1]scale=300:300[b];[2]scale=300:300[c];[3]scale=176:176:flags=neighbor[d];[4]scale=72:72:flags=neighbor[e];color=white:s=300x300:d=1[bg];[bg][d]overlay=10:60[bg2];[bg2][e]overlay=200:60,drawtext=text='40px / 16px (x4)':fontsize=16:x=10:y=20:fontcolor=0x6b3f26[f];[a][b][c][f]hstack=4[r1];[r1][5]vstack" \
 -i $O/row2.png -frames:v 1 $CH/gate/gate2.png 2>&1 | head -5
rm -rf $O; echo "saved $CH/gate/gate2.png"
