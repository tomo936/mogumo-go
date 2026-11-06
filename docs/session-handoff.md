# 会話の引き継ぎメモ（会話を新しくしたら最初に読む）

シロとの受け渡しは `handoff/`（別物）。こちらは Claude Code 自身の会話の引き継ぎ。

最終更新: 2026-11-06 夜（Claude Code）。区切りごとに上書きする。

## いまの状態
- ブランチ: **`cycle1-fog-shops`**。霧とお店の手順書（`docs/superpowers/plans/2026-11-06-fog-and-shops.md`）の手順1〜10と、最後の確認の直しまで完了（テスト 220件）。開発環境 `dev` にも反映済み（mogumo-go-dev）。本番 `main` は本人の OK まで出さない
- 進み具合の台帳: `.superpowers/sdd/2026-11-06-fog-and-shops/progress.md`（判断 `Ruling:` の一覧もここ）
- push: `git push` は Sandbox の外で動く設定（`.claude/settings.json` の excludedCommands）。**`git push` は単独のコマンドで実行する**（`cd` やパイプとつなぐと Sandbox の中に戻って失敗する）。dev への反映は worktree が使えないので `git merge-tree --write-tree origin/dev cycle1-fog-shops` → `git commit-tree` → `git push origin <sha>:refs/heads/dev`
- お店の仮データ: overpass-api.de がブラウザからの問い合わせを 406 で断るため、Supabase Edge Function `shops-overpass`（`supabase/functions/shops-overpass/index.ts`）経由に変更（設計書 §11）

## 次にやること
1. 本人が Edge Function `shops-overpass` をダッシュボードから置く（Verify JWT はオン）→ iPhone でお店が出るか・滑らかか・三角形の数を確認（手順11）
2. 雲の見た目を4案から選んでもらい直す（比較用ページ: `.superpowers/preview/vite.clouds.config.mjs` を `VARIANT=none|sparse|flat` で起動し `map-fog.html` を開く。試しの自宅は新宿駅近く）
3. 実機確認が済んだら、台帳の Ruling 一覧を本人に渡し、`superpowers:finishing-a-development-branch` で締める（台帳フォルダは消す）

## 本人待ち・シロ待ち
- 本人: ホットペッパーの API キー（次の段で使う）
- シロ: 連携は `handoff/`（`to-shiro/` に依頼、`to-claude/` にシロからの依頼）。作成中＝お店のピンのアイコン 13種（`handoff/to-shiro/2026-11-06-shop-pin-icons.md`）、女の子の歩行の絵

## 道具の置き場所（この会話の作業用フォルダ。再起動で消えることがある）
- Blender 4.2: `/tmp/claude-1000/-home-otosa-mogumo-go/f1bcb96d-7f7a-4651-a9c3-a1f83beeb930/scratchpad/blender/blender-4.2.3-linux-x64/blender`（無ければ `download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz` を作業用フォルダに展開）
  - 丸い字体: 同じ `blender/fonts/MPLUSRounded1c-ExtraBold.ttf`（無ければ google/fonts の OFL から取る）
- 画面を撮る道具（Playwright）: 同じ作業用フォルダの `pw/`（`PLAYWRIGHT_BROWSERS_PATH=$D/browsers NODE_USE_ENV_PROXY=1 node shot.mjs <url> <out> <待つms>`）
- 試作の画面: `.superpowers/preview/`（git 管理外）。`npx vite --config .superpowers/preview/vite.three.config.mjs --port 5199` と同じコマンドの中で撮る（Sandbox ではコマンドごとにネットワークが分かれるため、サーバーと撮影を1つのコマンドで行う）

## 本人の好み（作るときの判断の目安）
- 返事は必ず日本語。専門用語は言いかえる
- 見た目は「かわいい・ポップ・明るい」。リアルさより分かりやすさ。ただし配置は「まるでそこにあるように」本物に合わせる（お店は道路向き・実際の建物に合わせる）
- 気に入らないときは画像の見本を出してくる。見本に忠実に寄せ、並べて比べた画像を返すと話が早い
- 重さには敏感。「重くなる？」と聞かれたら数字（三角形の数など）で答える
- 迷ったら選べるようにする（例: お店ごとのデザイン選びのページ）
- これまでに「ダメ」だったもの: 泡っぽい雲、地面に置いたような3Dの雲（キモい）、ビルのラーメン屋、輪郭線の強い CG っぽさ

## よく使う場所
- 仕様の正本 `docs/SPEC.md`（§9 が最近の決定）、基本設計 `docs/basic-design.md`（N 番号の表）、DB `docs/detailed-design-db.md`
- お店の見本と決め方 `art/reference/shops/README.md`、模型の作り方 `art/prototypes/blender-*.py`、霧の素材 `src/assets/fog/`、歩く絵 `art/characters/boy-walk/`
- 進捗ボード（上司向け）: memory の progress-board を参照
