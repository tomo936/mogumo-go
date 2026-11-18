状態: 完了

# お店のピンのアイコン 13種（S16）

- 依頼日: 2026-11-06（チャットで依頼済み。シロは作成中。連携の正本をここに移す）
- 用途: 地図の上で、お店の3D建物の上に浮かべるピン。ジャンルがひと目で分かるようにする（SPEC S16）。霧の中の「気配」では「？」を重ねる
- 種類（ファイル名）: ramen, sushi, soba, washoku, izakaya, chinese, yakiniku, western, curry, cafe, cake, bakery, mystery（「？」）
- 形式: 背景透明 PNG、128×128px。丸いピンの中に入る絵。ピンの形（外枠）もあれば別ファイルで `pin-frame.png`
- 画風: 「明るい昼のグルメ」。お店の3D模型（`art/prototypes/shop-models-13.png`）と色をそろえる
- 置き場所: `art/pins/<種類>.png`（元データ）。アプリ用に変えたものは Claude Code が `src/assets/` に置く
- 仕様の出どころ: `docs/superpowers/specs/2026-11-06-fog-and-shops-design.md` 10章

## 納品メモ（2026-11-09）

- 採用したのはオーナーが ChatGPT で作ったセット（オーナー決定）。
- ジャンルごとにピンの色を分けた完成形も同送。「？」は黄色いキラキラなし。
- 画像本体はセッション経由で送付。
- 配置:
  - 完成形（色分け、512×512）: `art/pins/colored/` に `pin-<種類>.png` で
  - 128×128版: `art/pins/<種類>.png` に（cake は `pin-sweets.png` のファイル名で、中身は同じ）
  - 高画質の元データ: `art/pins/hires/` に
