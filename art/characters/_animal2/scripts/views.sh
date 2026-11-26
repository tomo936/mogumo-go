#!/bin/bash
# 4 方向（正面・右横・後ろ・斜め上の前）を 1 行に並べる。使い方: views.sh <glb（リポジトリの根からの / で始まるパス）> <出力 png> [1 枚の大きさ px（既定 300）] [見える高さ（既定 1.1）]
# 撮影はキリンの撮影ページ（cap.sh、three.js・swiftshader）を使う
K=/home/otosa/mogumo-go/art/characters/01-hoshifuru-kirin/scripts; PX=${3:-300}; VH=${4:-1.1}
O=$(mktemp -d /home/otosa/mogumo-go/art/characters/_animal2/.cap-XXXX)
$K/cap.sh "glb=$1&what=shots&s=f:0:0:$PX:$VH:0:0.5:0;s:90:0:$PX:$VH:0:0.5:0;b:180:0:$PX:$VH:0:0.5:0;o:30:40:$PX:$VH:0:0.5:0" $O > /dev/null
ffmpeg -v error -y -i $O/f.png -i $O/s.png -i $O/b.png -i $O/o.png -filter_complex "hstack=4" "$2" && echo "saved $2"
rm -rf $O
