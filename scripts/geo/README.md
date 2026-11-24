# 都道府県の形データ（public/geo/prefectures.json）

ワールドマップの県境と「行った県の塗りつぶし」用。47 地物（FeatureCollection）、properties は `{ "code": "13", "name": "東京都" }` だけ。

## 元データ・利用条件
- 国土数値情報「行政区域データ（N03）」2026 年（令和 8 年）1 月 1 日時点
  - ページ: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html
  - ダウンロード: https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2026/N03-20260101_GML.zip（中の `N03-20260101_prefecture.shp` を使用）
- 使用許諾条件: オープンデータ（CC BY 4.0）。利用規約 https://nlftp.mlit.go.jp/ksj/other/agreement.html は公共データ利用規約（PDL1.0）で、出典を書けば商用利用・加工・再配布ができる（編集・加工した場合は、その旨と元データ名の記載が要る。国が作ったかのような見せ方はしない）。
- 出典の書き方（アプリの画面に出す）: 「国土数値情報（行政区域データ）（国土交通省）（https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html）を加工して作成」
- 原典は国土地理院「数値地図（国土基本情報）」。ページ記載の承認番号「測量法に基づく国土地理院長承認（複製）R 7JHf 351」。

## 作り方
```
scripts/geo/build-prefectures.sh [作業フォルダ]
```
約 1.5GB 空きが要る。ダウンロード → 展開（.shp 系だけ。中のプログラムは実行しない）→ mapshaper 0.8.9 で次を行う。
```
mapshaper -i N03-20260101_prefecture.shp encoding=utf8 \
  -each 'code = N03_007.slice(0,2), name = N03_001' \
  -dissolve code copy-fields=name \
  -simplify visvalingam 0.1% keep-shapes \
  -filter-islands min-area=30000000 remove-empty \
  -filter-fields code,name -sort code \
  -o public/geo/prefectures.json format=geojson precision=0.0001
```
環境変数 `SIMPLIFY`（細かさ）・`MIN_AREA`（落とす離島の面積 m²）・`N03_YEAR` で変えられる。

## できたもの（2026-11-24）
- 123,025 ポリゴン → 47 地物。30km² 未満の島は落とした。
- 大きさ 250,803 バイト（gzip 前）、頂点の合計 13,049、座標は小数 4 桁。
- 試した設定: 0.6% / 5km² → 1.38MB（大きすぎ）、0.15% / 50km² → 360KB、0.08% / 100km² → 201KB。
