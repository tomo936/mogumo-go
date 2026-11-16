状態: 対応中（ファイルの受け取り待ちが 3 点: アイコン・スプラッシュ・本命の WebP）

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
- 起動の順番（スプラッシュ → OP → ローディング → メイン画面）について: オーナーと話して、今はタイトル画面（`art/ui/title.png`）に、ロゴ・「タップしてスタート」（丸い字でチカチカ）・お店を読んでいる間のパンケーキを出す形で作った（`src/credits/Splash.tsx`）。スプラッシュ（青空＋ロゴ）と OP をどう挟むかは、ファイルが届いてからオーナーと決める。
- ありがとうございました。
