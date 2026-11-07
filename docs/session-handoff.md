# 会話の引き継ぎメモ（会話を新しくしたら最初に読む）

シロとの受け渡しは `handoff/`（別物）。こちらは Claude Code 自身の会話の引き継ぎ。

最終更新: 2026-11-07 深夜（Claude Code）。区切りごとに上書きする。

## いまの状態
- ブランチ **`cycle1-building`**（`cycle1-checkin` から分岐）に **ビル（同じ建物に複数のお店）** を実装（2026-11-07、オーナー就寝中にシロの依頼で進めた）。設計 `docs/superpowers/specs/2026-11-07-multi-shop-building-design.md`、計画 `docs/superpowers/plans/2026-11-07-multi-shop-building.md`。テスト 370 件・型・ビルド OK。**dev に反映済み（14b1e0a）、実機確認待ち**（確認事項は `handoff/to-shiro/2026-11-07-building-owner-check.md`）
- `cycle1-checkin`（ホットペッパー＋チェックイン）は完成・実機確認済みで dev に反映済み。本番 `main` は未反映（本人の OK まで出さない）
- 開発用 Supabase `mogumo-go-dev` に置き済み: SQL 0002・0003、関数 `shops-hotpepper`・`checkin`。キー `HOTPEPPER_API_KEY` は Secrets
- push: `git push` は Sandbox の外で動く設定。**単独のコマンドで実行する**。dev への反映は `git merge-tree --write-tree origin/dev <branch>` → `git commit-tree` → `git push origin <sha>:refs/heads/dev`
- 進め方（トークン節約、本人と合意 2026-11-07）: 段ごとに会話を新しくする（必ずこのメモを更新してから）／小さい指摘は最後にまとめて直す／再確認は安いモデル／小さい手順はまとめる／試作の画像は少なく

## 次にやること
0. **ビルは完了（2026-11-07 実機確認、オーナー「進めよう」）**。dev に反映済み（`fcc5811`）。実機で直したこと: 大型かどうかは輪郭の広さ 2,500m² 以上（設計書 §8）、小さいビルは何軒でもピン5つ＋「+N」、ピンはカメラに合わせて縮みビルの屋根の上に立つ（`infra/screenScale.ts`）、点を含む輪郭のうち一番大きいものを使う（タイルの区切りで切られた建物のかけら対策）。ブランチ `cycle1-building` は main 未反映。**次の会話は下の 1（大型施設）を brainstorming から始める**
1. **大きい施設（6軒以上）と縦長の飲食ビル**: 新しい会話で brainstorming から。今は仮にビルの模型＋まとめたピン。**大型かどうかは輪郭の広さ 2,500m² 以上で決める（お店の数ではない、本人 OK 2026-11-07、設計書 §8）**。縦長ビルは「ビル＋ピン5つ＋N」になったので、縦長の特別扱いは不要。本人決定（2026-11-07）: 施設は実際の輪郭を立体にしてかわいく出す。遠くはピン1つ＋「済み/全部」、拡大でピンが屋根の上の各店の位置に散らばる（重なりは少しずらし、多ければ「+3」、住所の点に集まる店は一覧だけ）。縦長ビル（土地は小さく高い、6軒以上）は高さにタイルの render_height（少し縮めてよい）、拡大しても1つ＋数字、タップで階の順の一覧。素材: `art/pins/facility.png`、見本 `art/reference/shops/facility-large.png`・`facility-large-2.png`、色は `handoff/to-shiro/2026-11-07-large-facility-art.md` の末尾。決めること: チェックインの 50m を輪郭から測るか（サーバーの `checkin` も変わる、本人決定が要る）。**実機で見つかった宿題（2026-11-07、経堂）: ①コルティが大型とビルに分かれた本当の原因は、地図タイル（z14）の区切りで建物が切られたかけら（経度 139.63623）。→ 点を含む輪郭のうち、いちばん細かいズームで一番大きいものを使うように直した（2026-11-07）。かけらの面積は実際より小さいことがあるので、大型の段で「区切りをまたぐかけらをつなぐ」を考える。コルティと駅の建物は形が重ならない（つながっていない）。②駅ナカ（経堂駅の建物 3,663m² にスタバ・箱根そば → 今は大型の「0/2」とビルの模型で駅らしくない）。駅の見せ方を本人と決める。地図の building 層・poi の station を手がかりに。③ 駅の上に高い別の輪郭（h15、五右衛門など）が重なっている。重なった輪郭の扱いも見直す**。実データ: 東京駅まわり 7km 四方で 6軒以上の建物は 86
2. **そのあと「気配・デイリー」**（本人決定 2026-11-07）。決めること: 毎朝の件数（SPEC は3件）と選ぶ範囲（自宅 1km、圏外は今いる場所のまわり S10）、選び方はアプリ内が有力（U-10）、地図データだけの店のヒント、店名は 30m で明かす（S5・N-04）、1日の区切りは JST 0時。関係: SPEC S4・S5・S10、DB 設計 3.10 daily_hints。その次は図鑑
3. 本番（`main`）へ出すかは本人に聞く（未回答。おすすめは見た目を凝る段のあと）。出すなら本番の Supabase にも SQL 0002・0003、関数2つ、キーが要る
4. 見た目を凝る段（後で）: 灰色の「謎」の家、建物の向き、チープさ、演出の素材
5. あとでやること: 閉店・名前違いのお店を知らせる仕組み。ポコタンのチュートリアル（Live2D、`origin/add-pokotan-live2d`）は**ほかの機能より後**

## 本人待ち・シロ待ち
- シロ: 連携は `handoff/`。作成中＝お店のピンのアイコン 13種（届いたらビルのピンの仮の丸を差し替える。色は `src/shops/domain/badgeColor.ts`）、女の子の歩行の絵。未対応＝チェックイン演出の素材4種（`handoff/to-shiro/2026-11-06-checkin-effect-art.md`）、ビルのオーナー確認（`handoff/to-shiro/2026-11-07-building-owner-check.md`）

## 道具の置き場所（この会話の作業用フォルダ。再起動で消えることがある）
- Blender 4.2: `/tmp/claude-1000/-home-otosa-mogumo-go/f1bcb96d-7f7a-4651-a9c3-a1f83beeb930/scratchpad/blender/blender-4.2.3-linux-x64/blender`（無ければ `download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz` を作業用フォルダに展開）
  - 丸い字体: 同じ `blender/fonts/MPLUSRounded1c-ExtraBold.ttf`（無ければ google/fonts の OFL から取る）
- 画面を撮る道具（Playwright）: 同じ作業用フォルダの `pw/`（`PLAYWRIGHT_BROWSERS_PATH=$D/browsers NODE_USE_ENV_PROXY=1 node shot.mjs <url> <out> <待つms>`）
- 模型: ビルは `art/prototypes/blender-shops.py` の `KIND=building`（アプリ用は `LIGHT=1 TARGET=9000`）
- 試作の画面: `.superpowers/preview/`（git 管理外）。ビルの確認は `vite.ck.config.mjs`（ポート 5183）＋ `ck.html?hlat=..&hlng=..`（ログインなし、霧を晴らす仮の自宅）。`npx vite --config .superpowers/preview/vite.three.config.mjs --port 5199` と同じコマンドの中で撮る（Sandbox ではコマンドごとにネットワークが分かれるため、サーバーと撮影を1つのコマンドで行う）

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
