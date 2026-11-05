# もぐもGO 開発ルール（CLAUDE.md）

## このプロジェクトについて
- スマホ向け Web アプリ「もぐもGO」（霧晴らし × クエストのグルメ探索）。仕様の正本は `docs/SPEC.md`、上司課題の原文は `docs/source-dai2an-20261021.md`、1周目の計画は `docs/PLAN-cycle1.md`。作業前に該当箇所を読むこと。
- 技術: React + TypeScript + Vite / Supabase（DB・認証・ストレージ・Edge Functions）/ MapLibre GL JS + OpenFreeMap / ホットペッパーグルメAPI（キーはサーバー側のみ）/ OSRM（FOSSGIS）/ Vercel。完全無料の範囲で作る。対象は iPhone 優先。
- 現状: 土台のみ。React Router（`src/routes/`、`/login`・`/setup`・`/`）、ログイン状態は `src/auth/`（Supabase Auth の Google ログイン）、テストは Vitest。地図は `src/map/`（`domain/` 位置のならし・判定・状態、`infra/` 位置情報・MapLibre の色やワーカー・歩いたふり、`ui/` 地図の画面。調整値は `src/map/config.ts`、色の案は `src/map/infra/themes.ts`、開発中は `?fake` で歩いたふり）。出典は起動時のスプラッシュ（`src/credits/`）。初回設定は `src/setup/`（① ニックネーム → ② 最初のキャラ → ③ 自宅。`/setup/name`・`/setup/character`・`/setup/home`。profiles の有無とこの端末の自宅で振り分け。自宅は localStorage の `mogumo.home.<userId>` だけに保存）。素材は `src/assets/`（アプリで使う形）と `art/`（シロの元データ）。状態管理ライブラリは未導入。実装が進んだらこの節を更新すること。

## 工程（上司課題の進め方）
要件定義 → 基本設計 → 詳細設計 → 実装 → 検証 → 振り返り の順で進める。
- 決定はファイルに残す（SPEC・設計メモ）。会話の中だけで決めない。
- 作業の区切りごとに `docs/learning-log.md` へ記録する（やったこと／詰まった所／次回）。本人の感想欄は書き換えない。

## エージェントの使い方（4役）
- リーダー = メインエージェント。工程管理と割り振りを担当する。
- 設計役（designer）: 基本設計・詳細設計のフェーズで呼ぶ。設計メモを作り、実装はしない。
- 実装役（implementer）: 設計メモが固まった機能をまとめて実装するときに呼ぶ。小さい修正はメインが直接行う。
- テスト役（tester）: 検証フェーズとレビューで呼ぶ。読み取り専用で、書き換えはしない。
- 調査は組み込み Explore、計画は Plan モードを使う。

## コマンド
- 開発サーバー: `npm run dev`
- ビルド: `npm run build`（`tsc -b` の型チェック込み）
- 型チェックのみ: `npx tsc -b`
- Lint: `npm run lint`（Oxlint。ESLint ではない）
- プレビュー: `npm run preview`
- テスト: `npm test`（Vitest＋Testing Library、jsdom。対象は `src/**/*.test.{ts,tsx}`）

## ツールチェーンの注意（コードの書き方に効く）
- React 19 / Vite 8 / TypeScript 7。tsconfig はプロジェクトリファレンス方式（`tsconfig.app.json` が `src/`、`tsconfig.node.json` が `vite.config.ts`）。
- 型のみの import は `import type` を使う（verbatimModuleSyntax）。
- `enum`・`namespace`・コンストラクタのパラメータプロパティは使えない（erasableSyntaxOnly）。union 型やプレーンなオブジェクトで書く。
- import には拡張子を付ける（例: `import App from './App.tsx'`）。
- 未使用の変数・引数があるとビルドが落ちる（noUnusedLocals / noUnusedParameters）。
- React Compiler は無効。

## 構成
- 入口は `index.html` → `src/main.tsx`（`StrictMode` で `<App />` を `#root` にマウント）。
- そのまま配信する静的ファイルは `public/`、import する素材は `src/assets/`。

## セキュリティ（絶対）
- APIキーをソースに直接書かない。キーは `.env`（コミットしない）に置き、`.env` は読まない（settings の deny で禁止済み）。
- Supabase の service_role キーはブラウザ側コードに絶対に入れない。秘密が要る処理は Edge Functions に置く。
- コミット前に `scripts/check-secrets.sh` が自動でキー混入を検査する（pre-commit フック）。
- Sandbox は有効が前提（WSL2 内で開発する）。Sandbox の外で実行したい場合は理由を言ってから人間の確認を取る。

## Superpowers の適用範囲
- 適用する: 新機能の設計〜実装〜検証の工程（brainstorming / writing-plans / executing-plans / TDD / レビュー）。
- 適用しない: 小さい修正、CSS の微調整、プロトタイプ、地図の見た目の試行錯誤。その場合は通常の進め方でよい。
- 標準フローは executing-plans。subagent-driven-development は大きな機能のときだけ。

## 実装の方針
- コードはシンプルに。不要なラッパーや過度な抽象化をしない。
- 設計はクリーンアーキテクチャを意識する（本人の指示 2026-11-06）。機能ごとのフォルダ（例 `src/map/`）の中を3つに分ける。
  - `domain/`: ゲームの決まりと計算。純粋な TypeScript で、React・MapLibre・Supabase・ブラウザの API を import しない。単体テストの中心。
  - `infra/`: 外の世界とのつなぎ（位置情報、MapLibre、Supabase、Edge Functions 経由の外部 API）。domain の型を使ってよい。
  - `ui/`: React の画面と部品。domain と infra を組み合わせる。
  - 依存の向きは ui → infra → domain の一方向。domain はどこにも依存しない。共通の調整値（`config.ts`）は何も import しない。
  - ただし上の「シンプルに」を優先し、使い道が1つしかない interface やリポジトリ層を先回りで作らない。差し替えの必要が実際にある境界（タイル、位置情報、DB）だけを分ける。
- 仕様に無い機能を勝手に足さない。迷ったら SPEC を確認し、無ければ人間に聞く。
- 世界観は「明るい昼のグルメ」（青空色＋パステル、白基調、霧はもこもこの雲、図鑑はシールアルバム風）。UI はフラットに寄せる。
- 画像・動画素材について： 開発中に画像や動画が必要になったら、外部素材やプレースホルダで勝手に済ませず、必要な素材の仕様（内容・サイズ・用途・画風）を明記して、作業報告の中で Muse（シロ）への依頼として出すこと。素材はシロが生成して渡す。
