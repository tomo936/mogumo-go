# UI/UX 大規模見直しの参考資料（2026-11-23 調査。サブエージェントが web で調べたもの。画像の中身は未確認のものが多い）

## オーナーから渡された UI 部品集 5 件
| サイト | 中身 | ライセンス | もぐもGO での使い道 |
|---|---|---|---|
| animata.design | 動く部品 157+（Button・Card・FAB・Icon・Progress・Tabs など） | **MIT（1 ファイルをコピーして使える）** | Flower Menu（クローシュの扇メニュー）、Icon Ripple（押したときの波）、Blurry blob（ぼかした色の背景）、Gooey Tabs |
| snapblocks.site | 136 部品（一部有料 Pro） | 本文未確認・有料前提 | 見るだけ |
| scrollshaders.com | WebGL 背景シェーダー・静止画背景 | 有料の商用ライセンス（転売不可） | パステルの静止画背景の参考。地図も WebGL なので重ねると重い |
| audiocn.dev | 音の部品 | 未確認 | 合わない |
| scrolltide.co | テンプレート・部品（$299） | 本文未確認 | 見るだけ |
→ 取り込めるのは animata（MIT）だけ。ほかは参考に眺める。

## 参考デザイン
- パステルのゲーム UI: Casual Soft GUI（https://uncogames.itch.io/casual-soft-gui。枠 12・アイコン 90・紙吹雪/王冠/星/シール。ライセンス要確認）、kawaii UI のルール（https://trends.daisyui.com/trend/kawaii-ui/）、Letter Bounce の事例（https://uxplanet.org/case-study-letter-bounce-ui-design-for-a-mobile-game-application-489e0a81df9a）、Dribbble の Candy Game UI・Game UI コレクション（画像未確認）
- 位置情報ゲーム: Pikmin Bloom の画面一覧（https://www.pikminwiki.com/Pikmin_Bloom_interface。行った所は緑・まだは白）と批評（https://ixd.prattsi.org/2026/02/design-critique-pikmin-bloom-iphone-app/。主メニューが見つけにくい・一覧に状態が出ない）、Pokémon GO のスポットの待ちの批評（タップ→寄る→読み込みが遅い）
- コレクション: Game UI Database（画面の種類・色で探せる）、Pocket Camp の批評（通貨が 2 種で分かりにくい）、シールアルバム（集めたものが一覧で見える）
- 押し心地: https://kyonru.github.io/glyph.lua/feedback/（つぶれる→鳴る→粒→戻る）
- 字体: M PLUS Rounded 1c（OFL）・Zen Maru Gothic（OFL）。見出しは丸い字体、本文は読みやすい字体

## 見た目の質を上げる原則（調査から）
1. 色は役ごとにしぼる（地面・紙・差し色・状態）　2. 輪郭と文字はこげ茶にそろえる（純粋な黒を使わない）　3. 角の丸みは 3 段階　4. 影と立体感のルールは 1 つ（光の向き・濃さ）か、平らで通す　5. 余白は 4・8・12・16・24 の段　6. アイコンの線の太さと大きさをそろえる　7. 押したときの手ごたえ（0.06 秒でつぶれて 0.16 秒で戻る。大事な場面だけ大きく）　8. 主要ボタンは大きく、飾りと離す　9. 主メニューは見つけやすく　10. 押してからの待ちをなくす（枠を先に出す）　11. 見出しは丸い字体、小さい札は字数を減らす　12. 行った・まだを地図と図鑑で同じ色と形で示す

## 確かめられなかったこと
Dribbble・Behance・Mobbin・Pinterest・Game UI Database の個別の画像。ドラクエウォークの演出、かわいい系のガチャ・レベルアップの良い例。snapblocks・audiocn・scrolltide のライセンス本文。

## animata の部品の数字（2026-11-24 ページを読んで抜き出した。ライセンスはページに MIT と書かれておらず未確認 → コードは使わず、値だけ参考にする）
- Fluid Tabs（https://animata.design/docs/tabs/fluid-tabs）: 選んだタブの下地は spring（stiffness 380・damping 34・mass 0.75）、文字 0.28s cubic-bezier(.32,.72,0,1)、選んでいないタブは scale .98
- Flower Menu（https://animata.design/docs/fabs/flower-menu）: 開く 220ms cubic-bezier(.2,0,0,1)、遅れ 10ms＋順番×20ms、閉じる (n−1−順番)×14ms、閉じた花びらは scale .72、押すと scale .95、ボタンは最小 44px
- Ripple Button: 波紋 250ms ease-out scale 0→1／Card Skew: 傾き最大 X4°・Y6°（hover 用でスマホには不向き）／Icon Ripple: Tailwind の animate-ping／Progress: 棒の遅れ 順番×6ms
- 「押すと沈む・跳ねる」「持ち上がる」部品は animata に無かった → 押し心地は Josh Comeau の値（押す 34ms・戻り 600ms cubic-bezier(.3,.7,.4,1)）を使う
