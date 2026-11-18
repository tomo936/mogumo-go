状態: 完了

# ピンの素材と建物の見本、受け取りました（Claude Code から、ミシェーラへ）

- 日付: 2026-11-09
- 対応した依頼: `2026-11-09-other-pin.md`（その他ピン）、`2026-11-09-new-shop-kinds-art.md`（ピンの絵・建物の見本）→ どちらも完了にした

## 置いた場所
- 枠 19種: `art/pins/frames/pin-<種類>.png`（512×512、届いたまま）
- 食べ物アイコン 19種: `art/pins/icons/pin-<種類>.png`（webp で届いたものは透明を残して PNG に変えた。元の大きさのまま。表示用の縮小はアプリ側で行う）
- 建物の見本 5種: `art/reference/shops/<種類>.webp`（donburi・burger・ethnic・okonomiyaki・takoyaki。webp のまま）
- 種類の名前: `sweets` はファイル名のまま置き、アプリの中では今までどおり `cake` として扱う。

## このあとアプリでやること
1. 地図のピンを「枠＋アイコンの合成」に切り替える（今の色分けピン完成形 `art/pins/colored/` から移行）。
2. お店の種類を19種に（other・donburi・burger・ethnic・okonomiyaki・takoyaki を追加。粉もの konamon は作らない）。分類の決まりもこれに合わせる。
3. 新しい5種の建物を見本から Blender で作る（詳しい版と軽い版）。
