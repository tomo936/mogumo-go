# 会話の引き継ぎメモ（会話を新しくしたら最初に読む）

シロとの受け渡しは `handoff/`（別物）。こちらは Claude Code 自身の会話の引き継ぎ。

最終更新: 2026-11-07（Claude Code）。区切りごとに上書きする。

## いまの状態
- ブランチ **`cycle1-checkin`**（ホットペッパー連携＋チェックイン）は**完成・実機確認済み**（2026-11-07）。開発環境 `dev` に反映済み。本番 `main` は未反映（本人の OK まで出さない）。設計 `docs/superpowers/specs/2026-11-06-hotpepper-checkin-design.md`（§13 同じ建物に複数のお店・§14 同じお店のチェックインは1日1回）
- 開発用 Supabase `mogumo-go-dev` に置き済み: SQL 0002・0003、関数 `shops-hotpepper`・`checkin`（`shops-overpass` は削除）。キー `HOTPEPPER_API_KEY` は Secrets
- できたこと: 地図データのお店＋ホットペッパー／霧の中 50m のお店が見える／建物タップでお店へ寄って板が出る／50m 以内でチェックイン（同じお店は1日1回、今日済みは最初から「今日はチェックイン済み」）／紙ふぶき・帯・チェックの印・霧の波／開き直しても残る
- push: `git push` は Sandbox の外で動く設定。**単独のコマンドで実行する**。dev への反映は `git merge-tree --write-tree origin/dev <branch>` → `git commit-tree` → `git push origin <sha>:refs/heads/dev`
- 進め方（トークン節約、本人と合意 2026-11-07）: 段ごとに会話を新しくする／小さい指摘は最後にまとめて直す／再確認は安いモデル、Opus はお金・安全と最後の確認だけ／小さい手順はまとめる／試作の画像は少なく

## 次にやること
0. **ビルの反映（シロの見本 `art/reference/shops/building-multi.png`）**: 模型＋設計書 §13 の仕組み（同じ建物の複数のお店を1つにまとめ、タップで一覧）。ショーケースの中身はどの店にも見える汎用の中身（あたたかい明かり・カウンター・小さなテーブル）で作る（オーナーが任せると回答 2026-11-07、`handoff/to-claude/2026-11-07-building-showcase-reply.md`）。お店の種類は上のピンで見せる。気配・デイリーの前にやるか後にやるかは本人に確認する。「その他（謎）」の建物はレストラン風に差し替え済み（2026-11-07、本人が地図で確認済み）
1. **次は「気配・デイリー」（本人決定 2026-11-07）**。新しい会話で brainstorming から始める。決めること: 毎朝の件数（SPEC は3件）と選ぶ範囲（自宅 1km、圏外は今いる場所のまわり S10）、自宅をサーバーに送らないので選び方はアプリ内が有力（U-10）、地図データだけの店のヒント（キャッチ無し→ジャンルからの決まった文）、店名は 30m で明かす（S5・N-04）、1日の区切りは JST 0時（チェックインと同じ）。関係: SPEC S4・S5・S10、DB 設計 3.10 daily_hints。その次は図鑑の予定
2. 本番（`main`）へ出すかは本人に聞く（2026-11-07 時点で未回答。おすすめは見た目を凝る段のあと）。出すなら本番の Supabase にも SQL 0002・0003、関数2つ、キーが要る（今はお店の仮データは開発用だけの決まり）
3. 見た目を凝る段（後で）: ビル1つ＋一覧（§13、シロの見本待ち）、灰色の「謎」の家、建物の向き、チープさ、演出の素材
4. あとでやること: 閉店・名前違いのお店を知らせる仕組み。ポコタンのチュートリアル（Live2D、`origin/add-pokotan-live2d`）は**ほかの機能より後**

## 本人待ち・シロ待ち
- シロ: 連携は `handoff/`。作成中＝お店のピンのアイコン 13種、女の子の歩行の絵。未対応＝チェックイン演出の素材4種（`handoff/to-shiro/2026-11-06-checkin-effect-art.md`）、複数のお店が入るビルの見本（`handoff/to-shiro/2026-11-06-multi-shop-building.md`）

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
