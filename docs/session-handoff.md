# 会話の引き継ぎメモ（会話を新しくしたら最初に読む）

シロとの受け渡しは `handoff/`（別物）。こちらは Claude Code 自身の会話の引き継ぎ。

最終更新: 2026-11-06 夜（Claude Code）。区切りごとに上書きする。

## いまの状態
- ブランチ: **`cycle1-checkin`**（ホットペッパー連携＋チェックイン。手順書 `docs/superpowers/plans/2026-11-06-hotpepper-checkin.md` の手順1〜12 まで完了。13 は本人の実機確認）。設計 `docs/superpowers/specs/2026-11-06-hotpepper-checkin-design.md`。本番 `main` は本人の OK まで出さない
- 進み具合の台帳: `.superpowers/sdd/2026-11-06-hotpepper-checkin/`
- できたこと: 地図データのお店を土台にホットペッパーを上乗せ／霧の中 50m のお店が見える（まわりの雲がうすくなる）／建物タップ → シート → チェックイン（Edge Function `checkin` ＋ SQL `perform_checkin`）／紙ふぶき・帯・チェックの印・霧の波／クレジット表示
- push: `git push` は Sandbox の外で動く設定。**単独のコマンドで実行する**。dev への反映は `git merge-tree --write-tree origin/dev cycle1-checkin` → `git commit-tree` → `git push origin <sha>:refs/heads/dev`（レビューのあとに親エージェントが行う）
- 霧の確認: `.superpowers/preview/vite.fog2.config.mjs`（ポート 5181）で `map-fog.html`

## 次にやること
1. 本人が公開の手順書 `docs/superpowers/plans/2026-11-06-hotpepper-checkin-deploy.md` を実行（**開発用 `mogumo-go-dev` で。本番は使わない**）→ iPhone で確認（手順13）
2. ブランチ全体の最後の確認と締め（`superpowers:finishing-a-development-branch`）
3. そのあとの機能を本人に聞いて選ぶ: 気配・デイリー／図鑑／ルート晴れ（OSRM）／町制覇 など
4. ポコタンのチュートリアル（Live2D、ブランチ `origin/add-pokotan-live2d`）は欲しいが、**ほかの機能より後**（優先度は低い）

## 本人待ち・シロ待ち
- 本人: 手順書の実行（SQL・関数2つ・古い関数の削除）と iPhone 確認
- シロ: 連携は `handoff/`。作成中＝お店のピンのアイコン 13種（`handoff/to-shiro/2026-11-06-shop-pin-icons.md`）、女の子の歩行の絵。未対応＝チェックイン演出の素材4種（`handoff/to-shiro/2026-11-06-checkin-effect-art.md`）

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
- これまでに「ダメ」だったもの: 泡っぽい雲、地面に置いたような3Dの雲（キモい）、3Dの雲全般（→ 絵本風 2.5D をコードで描く方針に）、ビルのラーメン屋、輪郭線の強い CG っぽさ

## よく使う場所
- 仕様の正本 `docs/SPEC.md`（§9 が最近の決定）、基本設計 `docs/basic-design.md`（N 番号の表）、DB `docs/detailed-design-db.md`
- お店の見本と決め方 `art/reference/shops/README.md`、模型の作り方 `art/prototypes/blender-*.py`、霧の素材 `src/assets/fog/`、歩く絵 `art/characters/boy-walk/`
- 進捗ボード（上司向け）: memory の progress-board を参照
