# 会話の引き継ぎメモ（会話を新しくしたら最初に読む）

シロとの受け渡しは `handoff/`（別物）。こちらは Claude Code 自身の会話の引き継ぎ。

最終更新: 2026-11-09 夜（Claude Code）。区切りごとに上書きする。

## いまの状態
- ブランチ **`cycle1-building`**（`cycle1-checkin` から分岐）に **ビル（同じ建物に複数のお店）** を実装（2026-11-07、オーナー就寝中にシロの依頼で進めた）。設計 `docs/superpowers/specs/2026-11-07-multi-shop-building-design.md`、計画 `docs/superpowers/plans/2026-11-07-multi-shop-building.md`。テスト 370 件・型・ビルド OK。**dev に反映済み（14b1e0a）、実機確認待ち**（確認事項は `handoff/to-shiro/2026-11-07-building-owner-check.md`）
- `cycle1-checkin`（ホットペッパー＋チェックイン）は完成・実機確認済みで dev に反映済み。本番 `main` は未反映（本人の OK まで出さない）
- 開発用 Supabase `mogumo-go-dev` に置き済み: SQL 0002・0003、関数 `shops-hotpepper`・`checkin`。キー `HOTPEPPER_API_KEY` は Secrets
- push: `git push` は Sandbox の外で動く設定。**単独のコマンドで実行する**。dev への反映は `git merge-tree --write-tree origin/dev <branch>` → `git commit-tree` → `git push origin <sha>:refs/heads/dev`
- 進め方: CLAUDE.md「トークンの節約」を参照（リーダーはクリアしない・段の終わりはこのメモを更新してから compact・サブには2回失敗で打ち切りの一文）

## 次にやること
- **2026-11-09 夜の区切り**: 気配・デイリー（dev の Supabase に反映済み、実機の通し確認は本人が今度）、ピンの作り直し（合成19種・symbol・動かすと隠す・?debug）、お店の種類18、新しい5種の模型、アバターのお試し版まで完了。dev は最新、main は未反映。**次は図鑑か、お店のシート（本人が選ぶ）**
0. **ビルと大型施設・駅は完了（2026-11-07、オーナー「いいね」）**。ブランチ `cycle1-building`、dev に反映済み（`6a0acdd`）、main は未反映。設計 `docs/superpowers/specs/2026-11-07-multi-shop-building-design.md`・`2026-11-07-large-facility-design.md`（§8 が駅の最終決定）。できたこと: 2〜5軒のビル（ピン並べ・+N）、2,500m² 以上の大型施設は実際の輪郭を立体（`src/shops/infra/facilityLayer.ts`、見本 `facility-large.png`）、駅の点を含む建物は駅として立体（シロの見本 `station-shape-1〜3.webp`：グレーの壁・緑の帯2段・縦長の窓・丸いひさし・時計）、駅と施設は地図の輪郭どおり（1つの輪郭なら名前は両方）、名前の札（施設は白い丸、駅は駅名標の形）、拡大でピンが屋根の上に散らばる。チェックインはお店の点から 50m のまま（本人決定）
1. **残りの小さい所・経堂駅のまとめ・お店を全部出す（LOD）も完了（2026-11-07 夕方、本人「問題なし」）**。設計 `docs/superpowers/specs/2026-11-07-shop-lod-design.md`（§8 本人回答、§9 実装の記録）。dev に反映済み（`2d17236`）。ピンが多すぎる場所が出たら本人と相談（§7 の4）
2. **そのあと「気配・デイリー」**（本人決定 2026-11-07）。poi の文字は見えなかった（2026-11-07。地図の型 positron には `poi` の層が無い。霧の中・晴れた所の両方で撮って確認）ので、計画の Task 1 は飛ばした。決めること: 毎朝の件数（SPEC は3件）と選ぶ範囲（自宅 1km、圏外は今いる場所のまわり S10）、選び方はアプリ内が有力（U-10）、地図データだけの店のヒント、店名は 30m で明かす（S5・N-04）、1日の区切りは JST 0時。関係: SPEC S4・S5・S10、DB 設計 3.10 daily_hints。その次は図鑑
3. 本番（`main`）へ出すかは本人に聞く（未回答。おすすめは見た目を凝る段のあと）。出すなら本番の Supabase にも SQL 0002・0003、関数2つ、キーが要る
4. 見た目を凝る段（後で）: 灰色の「謎」の家、建物の向き、チープさ、演出の素材
5. あとでやること: 閉店・名前違いのお店を知らせる仕組み。ポコタンのチュートリアル（Live2D、`origin/add-pokotan-live2d`）は**ほかの機能より後**。**お店のシートの将来案（2026-11-09 本人、相談のみ・未決定）**: ①タップでは軽く（店名・ジャンルのアイコン・距離・チェックイン）、上にスライドしたら全画面で詳細（予算・営業時間・写真など）の2段（途中の「半分」の段は無し。本人 2026-11-09） ②ホットペッパーのページは埋め込めないことが多い・PWA は中でブラウザを開けないので「ホットペッパーで見る」で Safari の別タブ ③シートの上でお店の3D模型がくるくる回る（地図の模型をそのまま使える。N-27 の細かい模型の段と合わせると良い）。**細かい模型（2026-11-09 本人、いつかの話）**: 地図の模型は重さのため1軒 約9,000三角形のまま。タップしてシートを開いた1軒だけ、とても細かい模型（5万〜10万三角形）にする案。全画面の詳細では、そのお店のジオラマ（店の中まで作り込んだ模型、SPEC N-27・`art/reference/shops/diorama/`）を見せたい（本人。まだ余計な機能かもしれないので後回し）。**チェックインの演出の案（2026-11-09 本人、今度やる）**: 見本動画 `art/reference/checkin-concept.mp4`。霧の中で近づくとお店が見え、カメラが寄り、**アバターがお店の入口の前まで歩いていく**（1〜2秒、着いたらお店を向く、終わったら本当の位置へ戻る。最大50m なので少し速足）、カード（アイコン・営業中・星・チェックイン）、紙ふぶき＋「チェックイン完了 +pt」の帯。霧のうすさ・カメラの寄せ・紙ふぶき・帯は既にある。足すのは歩く演出と見た目の寄せ。細かい模型はシートの段で

## 本人待ち・シロ待ち
- アバター（2026-11-09）: 男の子の歩く絵でお試し版を入れた（`src/map/infra/avatarMarker.ts`、高さ 40px、立っている間は CSS の息づかい）。女の子の歩く絵は依頼済み（`handoff/to-shiro/2026-11-09-girl-walk-art.md`）。待機のコマ絵を頼むかは未定。本人「キャラは3Dにしないと変では？」（2026-11-09）→ 案A 3D のキャラ（手間大）／案B 2D の絵を 3D の世界の中に板として立たせる（ズームで大きさが変わる・建物に隠れる。おすすめ）を出したが、**一旦保留**
- **気配・デイリーの実機の通し確認は本人が「今度」行う**（2026-11-09）。SQL 0004・関数 checkin（osmTile.ts 追加）・daily-hints は dev の Supabase に反映済み。確かめる項目は `docs/superpowers/plans/2026-11-07-daily-hints-deploy.md` の 5
- 「その他」の灰色ピン（2026-11-09 調査）: 新宿 26%・東京駅 33%・経堂 36%・三軒茶屋 38%（地図の店だけで数えた値）。主な理由は屋号だけの店・ローマ字の店名・未登録のチェーン。**本人判断: ホットペッパーで種類が付く分で様子を見る。言葉の追加や OSM の cuisine の取得は今はしない**。調査の台本 scratchpad/genre/sj.mjs
- **お店の種類を増やす（2026-11-09 本人決定）**: ピンも3Dの模型も増やす（案B）。候補は本人の挙げたお好み焼き・たこ焼き・もんじゃ、ハンバーガー、牛丼ほか。「その他」になる店の実データ調査（サブ）の結果で種類を決める → ミシェーラにピン＋見た目の見本を依頼 → Blender で模型（`art/prototypes/blender-shops.py`、軽い版 `blender-lod.py` も）。「その他」のピンは依頼済み（`handoff/to-shiro/2026-11-09-other-pin.md`）
- ピンの絵（2026-11-09 本人決定）: アプリで使うのは色分けの完成形 `art/pins/colored/pin-<種類>.png`（13種そろった）だけ。アイコン単体 `art/pins/<種類>.png` と高画質 `art/pins/hires/`（10種まで、残り3種は不要）は画質が足りないので使わない（保管のみ）。次は地図のピン（仮の丸・気配の「？」）を完成形に差し替える
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

## 2026-11-09 夜: 続きから（12時過ぎに再開）
- お店のシート（2段・写真シール＋わたしの記録・指で引く動き）は完了し dev に上げ済み。下へ引いても閉じない（× だけで閉じる）。
- 写真は pc.l（238px）を使う版に変更済み。Supabase の関数 `shops-hotpepper` の置き直しはオーナーが実施済み。実機で写真の大きさを確認してもらう（未確認）。
- 男の子の3D（ミシェーラの試し）: AI モデル（公式・指紋一致）は D:\mogumo-3d\ComfyUI\models にあり、形だけの GLB（boy_s123_shape_00001_.glb）はできた。色付きの組み立ては、CUDA の pip 部品が揃わず停止中（cusparse のヘッダは入ったが cublas などが入らない）。
- 次の一手（オーナーの確認が要る）: NVIDIA 公式の CUDA Toolkit 13.0（約3〜4GB、D: に入れる）を入れて組み立て直す。もしくは色付きは保留してミシェーラに報告する。
- 次の機能: 図鑑（シールアルバム風。お店のシートと同じ詳しい画面を使い回す）。設計から始める。

## 2026-11-10: 男の子の3D（色付き）は停止
- 形だけの3D（D:\mogumo-3d\ComfyUI\output\mogumo\boy_s123_shape_00001_.glb）と、4方向の確認画像はできている。
- 色付きは停止。CUDA 13.0 を Windows に入れた（nvcc は動く）が、組み立ての段階で「指定されたパスが見つかりません」が出る。Visual Studio Build Tools の Windows SDK を公式の修復で入れ直しても直らず、小さい CUDA テストでも同じ。
- 方針: 色付きはミシェーラに「形はできた・色は環境の問題で停止」と報告する。CUDA 13.0 は残しても消してもよい（Windows の「アプリ」から削除できる）。
- 次は図鑑（設計から）。
