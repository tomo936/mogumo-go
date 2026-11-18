状態: 完了

# ブランディング素材 3 点の受領（Claude Code から、ミシェーラへ）

- 日付: 2026-11-16
- 受け取った物（オーナー経由）:
  - ローディングアニメ: `loading-pancake-regen6.webm` と PNG 連番 89 枚の zip → `art/loading/` に置いた（`loading-pancake-regen6.webm`・`loading-pancake-regen6-frames.zip`）。
    - アプリ用は、PNG 連番から幅 128px・30fps のアニメ WebP を作った（`src/assets/ui/loading-pancake.webp`。作り方は `art/ui/convert-ui.sh` の最後）。絵は変えていない。
- **ファイルとして届いていない物（画像はチャットに表示されたが、ファイルが無い）**。リポジトリの次の場所に置いてもらえると助かります:
  1. アプリアイコン `appicon-kuma-v1.png`（1024×1024）→ `art/branding/`
  2. スプラッシュ `splash-min-sky-v4.png`（1179×2556）→ `art/branding/`
  3. ローディング本命の `loading-pancake-regen6.webp` → `art/loading/`（今は連番から作った WebP で動かしている。本命が来たら比べて軽い方を使う）
  4. ~~**追加のお願い**: 固定版ロゴだけの透過 PNG~~ → **オーナーから受け取り済み**（`art/branding/logo.png` 2218×836・透過。タイトル画面に反映）。もとのお願い: 固定版ロゴだけの透過 PNG（できれば幅 1200px 前後）→ `art/branding/`。オーナーの決定で、タイトル画面（オーナーの絵 `art/ui/title.png`。街の通りの男の子とねこ）の上の方にロゴを載せるため。
- 起動の順番について: **オーナー決定（2026-11-16）: OP はなし。タイトル画面 →「タップしてスタート」を押す → 右下にパンケーキのローディング → 終わったらメイン画面**。前の案: 今はタイトル画面（`art/ui/title.png`）に、ロゴ・「タップしてスタート」（丸い字でチカチカ）・お店を読んでいる間のパンケーキを出す形で作った（`src/credits/Splash.tsx`）。スプラッシュ（青空＋ロゴ）と OP をどう挟むかは、ファイルが届いてからオーナーと決める。
- ありがとうございました。

## 追記 2026-11-16: zip で再送の 3 点を受領（branding-assets-20261116.zip）
- `art/branding/appicon-kuma-v1.png`（1024×1024、マスター）→ アプリのアイコンに反映。絵は変えず縮小だけ: `public/apple-touch-icon.png`（180px、iPhone のホーム画面）・`public/icon-192.png`・`public/icon-32.png`（ブラウザのタブ）。`index.html` から読む。作り方は `art/ui/convert-ui.sh` の最後。
- `art/branding/splash-min-sky-v4.png`（1179×2556）→ 置いただけ。オーナーの決定でアプリの中の起動はタイトル画面 → タップ → ローディング → メインになり、青空のスプラッシュを出す場所が今は無い（iPhone のホーム画面から開いたときの起動画面に使う案はオーナーに確認中）。
- `art/loading/loading-pancake-regen6.webp`（本命、1.6MB・512px）→ 置いた。画面では幅 64px で出すので、アプリには連番から作った幅 128px 版（`src/assets/ui/loading-pancake.webp`、188KB）を使う（同じ絵・同じ 30fps。読み込みを軽くするため）。
- ありがとうございました。
