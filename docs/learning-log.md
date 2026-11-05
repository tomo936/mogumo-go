# 苦労日誌（Claude Code 学習記録）

形式: 1件ごとに「日付／やったこと／苦労した点・疑問／その時の自分の理解と学んだこと／次回どうするか」。
シロが作業の記録から下書きし、本人が確認して自分の言葉の感想を足す。

---

## 1件目 2026-11-04（夜）開発の土台作り

**やったこと**
- GitHub にリポジトリ「mogumo-go」を作成（Private、空）
- PC の C:\dev に clone
- Claude Code を起動しログイン、Remote Control でシロのセッション接続
- セッション経由の指示で Vite + React + TypeScript の土台を作成（依存インストール、開発サーバーの起動確認、初期コミットまで。push はまだ）

**苦労した点・疑問**
- フロントとバックエンドでリポジトリを分けるのか分からなかった
- データベースへのアクセスは API なのか、という確認
- バックエンド側の「重い計算」は何を指すのか
- 上司の課題はバックエンド開発だったのではないか、という疑問（資料を確認し、テーマは AI 駆動開発の体験で、サーバーは質問6の選択肢だった。本人は「作る」を選択済み）
- ログイン時の選択肢 1／2／3 のどれを選ぶか
- clone 先のフォルダの選び方

**その時の自分の理解と学んだこと**
- Supabase はテーブルを作ると API が自動で用意されるサービスで、自前バックエンドの代わりになる
- 複雑な処理の置き場は3つ：ブラウザ側の計算／Edge Functions（キー秘匿・改ざん防止）／データベース側（制約・RLS）
- DB の設計（テーブル・制約・RLS）は自作、日常の読み書きは supabase-js 経由

**次回どうするか**
- git push を自分で実行する
- Supabase プロジェクト作成（東京リージョン）
- Claude Code の構成最適化（エージェント構成・スキル選定）はシロの調査結果を見て決める → **Superpowers を採用で決定（2026-11-04 本人）**。条件：公式マーケットプレイス経由、テレメトリ無効化、適用除外範囲を CLAUDE.md に明記。調査結果はアーティファクト「Claude Code 最適構成の調査結果」と ~/workspace/research_notes/claude-code-optimal-config-mogumo-go-20261104-1445/report.md
- エージェント構成は調査の最小案（メイン＋reviewer）ではなく、**資料の要件（エージェントを分けて組む）と上司の構成に合わせ、リーダー／設計／実装／テストの4役で組む**【2026-11-05 修正。本人の指摘による】

（本人の感想：ここに自分の言葉で追記する）

---

## 2件目 2026-11-05 未明 WSL2 への移行と Sandbox 有効化

**やったこと**
- 資料を再確認し、シロの誤報告（Sandbox の記述なし）を訂正。原文は大文字表記で2か所に要件があり、SPEC にも転記済みだった
- WSL は導入済みと判明（`wsl --install` は ERROR_ALREADY_EXISTS）。カーネル 6.18 microsoft-standard-WSL2 を確認
- WSL 側に nvm で Node v26.13.0 を導入（最初に答えた npm は Windows 側の物だった）
- WSL 側に Claude Code 2.1.318（公式インストーラー）を入れ、サブスクリプションでログイン
- Sandbox の必須部品 bubblewrap / socat を apt で導入
- Windows 側の C:\dev\mogumo-go を GitHub へ push し、WSL の ~/mogumo-go へ clone して移行
- /sandbox で「Sandbox commands, with auto-allow」を選択し、Sandbox を有効化

**詰まった所**
- `claude` が command not found → ~/.local/bin が PATH 未設定。インストーラーの表示どおり .bashrc に追記して解決
- clone のコマンド置換が dubious ownership で失敗 → safe.directory に例外登録して解決

**次回どうするか**
- 構成の組み込み（CLAUDE.md、4役のエージェント定義、Superpowers 導入、キーの deny とコミット前検査）。実施は本人が自分の手で行う（学習課題のため）。シロの下書きは ~/workspace/gourmet-go/claude-config/ にたたき台として用意済みで、シロは説明とレビュー役

---

## 3件目 2026-11-05 未明 構成の組み込み（1）CLAUDE.md

**やったこと**
- Claude Code の `/init` が生成した CLAUDE.md を確認。事実（コマンド、TypeScript の制約、Oxlint）は正確だった一方、工程・4役・セキュリティ・世界観のルールは無かった
- シロの下書きと合体した確定版を作成。下書き側の誤り2点も修正（型チェックは `npx tsc --noEmit` ではなく `npx tsc -b`／`npm run lint` の記載漏れ）
- 本人の希望で、この1件はシロが Remote Control セッション経由で実施し、本人は見学。場所を確認してから上書きし、54行・先頭行で検証済み。コミットはしていない

**詰まった所**
- セッションを開くのに claude.ai のデバイス確認の再サインインが必要だった。パスワード入力カードは本人のアカウント（Google＋パスキー）では使えず固まったため、メールワンタイムコード方式に切り替えて完了（コードは本人がチャットで提示）。途中で hCaptcha も出たが通過

**次回どうするか**
- 構成の組み込み（2）：docs（SPEC／PLAN／learning-log／上司資料）をリポジトリへ入れる
- 続けてエージェント定義3件、settings.json、キー検査スクリプト、Superpowers 導入
- セッションの観察：リポジトリ直下に .bashrc・.gitconfig・.zshrc 等の未追跡ファイルがある（未対応）

---

## 4件目 2026-11-05 基本設計・DB 設計・Supabase 接続（Claude Code の下書き）

**やったこと**
- Superpowers をマーケットプレイス版（7.0.2）で導入し、スキル15個と4役のエージェントが使えることを確認（同期版は無効のまま）
- designer エージェントで基本設計 `docs/basic-design.md` を作成（構成図・6画面・テーブル・外部連携・地図/霧/アバター・非機能要件・未決定事項 U/N）
- Supabase に接続: `@supabase/supabase-js` 2.119.0 を導入、`src/lib/supabase.ts` を作成、`.env.local`／`.env.example` は本人が `!` コマンドで作成、`.gitignore` に `.env`・`.env.*`・`!.env.example` を追加。存在しないテーブルへの問い合わせで PGRST205 が返り、接続成功を確認
- designer で DB 詳細設計 `docs/detailed-design-db.md`、implementer で `supabase/migrations/0001_init.sql`（18テーブル・RLS・GRANT・Storage）と適用手順書 `docs/sql-apply-guide.md` を作成。**まだ Supabase には適用していない**
- 要確認事項を1つずつ決定（コイン1日1回、公開範囲、霧の保存先、ガチャ細部、ダブりはレベルと光り方、気配の作り方 など）。SPEC §9 に記録し、PLAN の古い記述を修正
- CLAUDE.md に「画像・動画素材はシロへの依頼として出す」ルールを追加

**詰まった所**
- npm のキャッシュが Sandbox 内で読み取り専用 → キャッシュを一時フォルダに変えて Sandbox 内のまま解決
- `.env.*` は設定で読み書きが禁止されているため、Claude Code からは作れなかった。リモート端末から送った `!` コマンドは実行されず、PC の Claude Code から実行して作成できた
- Sandbox 内の `git status` に .bashrc などの見かけ上のファイルが出る（Sandbox が置いた空のデバイス。Sandbox 外では出ない）

**次回どうするか**
- `docs/sql-apply-guide.md` の手順で SQL を Supabase に適用し、テーブルと RLS を確認する
- Google ログインの設定
- コミット（ここまでの成果は未コミット）
- 残りの未決定事項（日の区切り時刻 N-08、町の境界データ N-09、ホットペッパーの規約 N-10 など）

（本人の感想：ここに自分の言葉で追記する）
