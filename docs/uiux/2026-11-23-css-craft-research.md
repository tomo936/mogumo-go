# CSS で手作りの質感を出す技術（2026-11-23 調査。サブエージェントが web で調べたもの。数字のうち出典が無いものは「目安」と明記）

- 影の重ね: 接地の固い影＋広くうすい環境の影を重ね、高いほど offset と blur を増やし濃さを減らす。影の色は黒でなく地と同じ色相の暗色（黒は地を灰色に濁らせる）— https://joshwcomeau.com/css/designing-shadows/ ・ https://tobiasahlin.com/blog/layered-smooth-box-shadows/
- ベベル: 上に明るい inset、下に同系の暗い inset（thoughtbot の記事。本文未確認）
- 厚みのある押せる物: 影・縁・面を別の層にし transform で動かす（box-shadow のアニメは重い）。押す瞬間 34ms、戻り 600ms cubic-bezier(.3,.7,.4,1)、hover は cubic-bezier(.3,.7,.4,1.5) — https://www.joshwcomeau.com/animation/3d-button/
- 紙の質感: SVG feTurbulence を stitchTiles でタイル化して低い opacity（目安 .04〜.08、出典なし）— https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/
- 縫い目の点線: mask で縁だけ残す書き方（角丸は要確認）— https://css-tip.com/css-dashed-border/
- 輪郭: 太さ一定の外輪郭＋内側に 1px の明るい線（ログインボーナスと同じ作り）。輪郭は地と同じ色相の暗色、純黒は使わない
- 文字の縁: -webkit-text-stroke ＋ paint-order: stroke fill（@supports で囲む）— https://developer.mozilla.org/docs/Web/CSS/paint-order
- リボン・札: clip-path、影は親の filter: drop-shadow — https://css-tip.com/css-ribbon/
- 色: 同じ色相のまま明るさだけ動かす（OKLCH）— https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl
- 確かめられなかった: 質の高い CodePen の実例、角丸と輪郭の比・紙目の濃さ・明暗の差の数字（目安のみ）

## アプリ内の基準（ログインボーナスの枠の色。見た目を合わせるために測っただけで、絵は切り出していない）
輪郭 #70311d（温かいこげ茶。図鑑の #4a2f18 よりやわらかい）／内側の明るい縁 #f7c5a6／地 #fcf1e0／縫い目 #ebd3b9／きらめき #facc61／チェック #fcca8e・#efb582
