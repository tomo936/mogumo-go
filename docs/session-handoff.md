# 会話の引き継ぎメモ（会話を新しくしたら最初に読む）

シロとの受け渡しは `handoff/`（別物）。こちらは Claude Code 自身の会話の引き継ぎ。

最終更新: 2026-11-06 夕方（Claude Code）。区切りごとに上書きする。

## いまの状態
- ブランチ: **`cycle1-fog-shops`**（`cycle1-setup` から作った。まだコードの変更なし）
- 開発環境（`dev` → mogumo-go-dev.vercel.app）は初回設定まで。本番（`main`）は本人の OK まで出さない（「ある程度実装したあと」）
- **push が止まっている**: この環境（Sandbox）から GitHub の認証が通らない。手元に未 push のコミットが 30件ほど。本人に `! git push origin <ブランチ>` を頼む

## 次にやること
1. **霧とお店の手順書を、サブエージェントのやり方で実行する**（本人決定: サブエージェント）
   - 手順書: `docs/superpowers/plans/2026-11-06-fog-and-shops.md`（11手順）
   - 設計書: `docs/superpowers/specs/2026-11-06-fog-and-shops-design.md`
   - 進み具合のメモ: `.superpowers/sdd/2026-11-06-fog-and-shops/progress.md`（作成済み。完了した手順は無い）
   - スキル `superpowers:subagent-driven-development` を使う
2. 終わったら `docs/learning-log.md` に記録し、このメモを更新する

## 本人待ち・シロ待ち
- 本人: push（上記）／ホットペッパーの API キー（次の段で使う）
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
