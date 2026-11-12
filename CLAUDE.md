# もぐもGO 開発ルール（CLAUDE.md）

## このプロジェクトについて
- スマホ向け Web アプリ「もぐもGO」（霧晴らし × クエストのグルメ探索）。仕様の正本は `docs/SPEC.md`、上司課題の原文は `docs/source-dai2an-20261021.md`、1周目の計画は `docs/PLAN-cycle1.md`。作業前に該当箇所を読むこと。
- 技術: React + TypeScript + Vite / Supabase（DB・認証・ストレージ・Edge Functions）/ MapLibre GL JS + OpenFreeMap / ホットペッパーグルメAPI（キーはサーバー側のみ）/ OSRM（FOSSGIS）/ Vercel。完全無料の範囲で作る。対象は iPhone 優先。
- 現状: 土台のみ。React Router（`src/routes/`、`/login`・`/setup`・`/`）、ログイン状態は `src/auth/`（Supabase Auth の Google ログイン）、テストは Vitest。地図は `src/map/`（`domain/` 位置のならし・判定・状態、`infra/` 位置情報・MapLibre の色やワーカー・歩いたふり、`ui/` 地図の画面。調整値は `src/map/config.ts`、色の案は `src/map/infra/themes.ts`、開発中は `?fake` で歩いたふり）。出典は起動時のスプラッシュ（`src/credits/`）。初回設定は `src/setup/`（① ニックネーム → ② 最初のキャラ → ③ 自宅。自宅は localStorage の `mogumo.home.<userId>` だけに保存）。霧は `src/fog/`（25m マス・自宅 200m の晴れ・雲の塊の置き方・チェックインの波の計算、`infra/fogLayer.ts` に絵本風 2.5D の雲を WebGL で描くカスタムレイヤー。霧の中で 50m 以内のお店のまわりは雲がうすくなる）、お店は `src/shops/`（13種の振り分け・置き方・表示の選び方・地図の店とホットペッパーの店の突き合わせ `domain/merge.ts`、`infra/` に地図タイルの `poi` 層からの店の取り出し・ホットペッパーの取得・地図の道路と建物の取り出し・建物の three.js レイヤー）。土台は地図データのお店（`osm:<番号>`）で、ホットペッパー（`hp:<ID>`）が詳細を上乗せする。同じ建物の輪郭に2軒以上あれば「ビル」1つにまとめる（`domain/grouping.ts`、模型 `src/assets/shops/building.glb`、上のピン `infra/buildingPins.ts`、一覧 `src/checkin/ui/BuildingSheet.tsx`）。輪郭 2,500m² 以上で2軒以上は大型施設、駅の点を含む建物は駅として、実際の輪郭を立体にする（`domain/facility.ts`、`infra/facilityLayer.ts`。名前の札は地図の施設名・駅名）。チェックインは `src/checkin/`（建物をタップ → お店のシート → 50m 以内なら実行 → 紙ふぶき・帯・チェックの印・霧の波）。サーバー側は Supabase Edge Functions の `supabase/functions/shops-hotpepper/`（ホットペッパー中継、キーは Secrets の `HOTPEPPER_API_KEY`）と `supabase/functions/checkin/`（50m の確認）、SQL 関数 `perform_checkin`（`supabase/migrations/0002_checkin.sql`）がチェックイン・コイン・晴れたセルを1つのトランザクションで書く。画面にホットペッパーのクレジット表示が必須（`MapPage`・スプラッシュ）。地図へのつなぎは `src/map/ui/worldLayers.ts`、three の共通部品は `src/lib/threeLayer.ts`。素材は `src/assets/`（アプリで使う形）と `art/`（シロの元データ・見本・試作）。状態管理ライブラリは未導入。**2026-11-07〜09 に足したもの**: お店は見える範囲を全部出し、遠くは軽い模型（LOD、`src/shops/domain/lod.ts`、模型は `src/assets/shops/lod/`）。お店の種類は 18（今の13＋donburi・burger・ethnic・okonomiyaki・takoyaki。「その他」は kind `mystery`、ピンは other の絵）、分類は `src/shops/domain/kind.ts`。ピンは ミシェーラの「枠＋食べ物の絵」を合成した `src/assets/pins/<種類>.png`（台本 `art/prototypes/compose-pins.mjs`）。1軒の店は MapLibre の symbol レイヤー（`src/shops/infra/shopPins.ts`）、ビル・施設は HTML マーカー（`buildingPins.ts`、屋根の高さは `src/lib/threeLayer.ts` の `projectAt`）。指で動かしている間はピンを隠す（`src/map/infra/userMove.ts`）、ピンを出す/出さないボタン、済みは右上に ✓。マーカーの CSS は必ず `position:absolute`（relative だと他のマーカーを押し下げる）。`?debug` で測る表示（`src/map/ui/debugOverlay.ts`）。気配・デイリーは `src/hints/`（探索ボタン・シート・気配のピン・店名を伏せる/30m で明かす・+10）、サーバーは `supabase/functions/daily-hints/`・SQL `0004_daily_hints.sql`。チェーン店は気配にしない（`src/hints/domain/chain.ts`・NSI から作った一覧 `chainNames.ts`＋手で足す `chainNamesExtra.ts`。3 文字以下のチェーン名は名前だけ・最初の語・名前＋〇〇店のときだけ当てる。サーバーは `daily-hints/` の写しで、同じ中身かをテストで確かめる。一覧は `node scripts/chains/build.ts` で作り直す。2026-11-12）。アバターは 3D の男の子（下の「3D のアバター」。2D の歩く絵 `src/map/infra/avatarMarker.ts` は 3D が読めないときの代わり）。道路などをタップしても何もしない。**2026-11-10 に足したもの**: 地図の見た目は絵本風の色（`MAP_THEME = 'illust'`、建物は高さでクリームの濃淡）。地図の上の部品は `src/map/ui/MapHud.tsx`（左上キャラと Lv、上の真ん中「？」で気配のシートが上から、右上ピン、下の真ん中クローシュの丸 → 扇で 図鑑・記録・ガチャ・マイページ・設定（丸ボタン・×・気配の雲・グルメコインの絵はミシェーラの完成形 `src/assets/ui/*.webp`、変換の台本 `art/ui/convert-ui.sh`。2026-11-12））。図鑑は `src/zukan/`、記録は `src/record/`（真上の地図＋日付スライダー、行った日のピン、「きろく｜じっせき」のタブ）、実績は `src/badges/`（domain に条件の一覧 `catalog.ts` と計算 `evaluate.ts`、ui に SVG のメダル `BadgeMedal.tsx`）、マイページは `src/mypage/`（ニックネームの変更・自宅の変更）、設定は `src/settings/`（お問い合わせのフォームの URL は `src/settings/config.ts`）。3D のアバターは `src/map/infra/avatarModel.ts`（2026-11-12 段 7: 素材 `src/assets/characters/101/avatar.glb` を遅れて読む。地図の上で身長 20m 固定・画面で最小 16px、速さで 待機／歩き／走り（1 秒続いてから・0.25 秒で混ぜる・再生の速さは進む速さに合わせて 0.7〜1.4 倍）、顔のこま送りとまばたき、`MapViewHandle.express('happy')` でうれしい（チェックイン成功で呼ぶ）。決まりの計算は `src/map/domain/avatar3d.ts`、値は `src/map/config.ts`。1px の m は `geo.ts` の `metersPerPixel`（MapLibre の 512px タイル））。お店のシート・ビルの一覧・気配のシートは手帳風（茶色の線・平らな色）、済みの印は `src/ui/DoneMark.tsx`、営業中は `src/checkin/domain/openNow.ts`。設定のバージョンにどの版か（コミットの短い番号）が出る。**2026-11-10 夜に足したもの（町）**: 町のクリア・コンプリートは `src/towns/`（domain に町の形 `shape.ts`・進み具合 `progress.ts`、infra に `townsApi.ts`、ui に帯 `TownBanner.tsx`・一覧 `TownList.tsx`・絵 `TownIcon.tsx`）。サーバーは `supabase/functions/towns/`（`index.ts`・`core.ts`・`tiles.ts`。自分のチェックインの記録だけを見て町を決め、お店をタイルから数え、判定する）と SQL `0005_towns.sql`（`grant_town`）。町の境目は e-Stat のデータを `scripts/towns/build.ts` で加工して作り（出力 `.towns-out/`、リポジトリには入れない）、Supabase の非公開バケット `towns` の `g/` に置く。置き方は `docs/superpowers/plans/2026-11-10-towns-deploy.md`。画面に e-Stat の出典と「加工して作成」の表示が必須（スプラッシュ・設定）。町で晴れたセルはサーバーに保存せず、端末が町の形から計算する。記録の地図の右上の「町」ボタンで「町の範囲」（行った町の境目と名前。クリア = 橙の実線、途中 = 茶色の点線。初期はオフ）を出せる（`src/towns/domain/outline.ts`、形は `townsApi.ts` の `loadTownShapes` が `towns.boundary` から読む、描画は `RecordMap.tsx`）。地図の左上は、キャラの丸のまわりの輪が経験値（経験値（新しいお店 +10・もう一度 +2、`src/zukan/domain/level.ts`。Lv n に 10×3n(n−1)÷2）で上がる Lv の、次の Lv までの進み）で、右どなりに持っているコイン（`MapHud.tsx`、数字は `MapPage` がチェックイン・町のクリアのたびに読み直す）。**2026-11-10 深夜に足したもの（週ミッション）**: `src/missions/`（domain に返事の読み取りと文 `mission.ts`・まわりの種類の軒数 `nearbyKinds.ts`、infra に `missionsApi.ts`、ui にチケット `MissionTickets.tsx`・達成の帯 `MissionBanner.tsx`）。気配のシートの下に出る（`ExploreSheet` の `extra`）。サーバーは `supabase/functions/weekly-missions/`（出題・数え直し。`kind.ts` は `src/shops/domain/kind.ts` の写しで、ずれはテストで見つかる）と SQL `0006_weekly_missions.sql`（`create_weekly_missions`・`settle_weekly_missions`）。チェックインの関数は変えず、チェックインの後にアプリが呼ぶ。コインの絵は `src/ui/CoinIcon.tsx`（グルメコインの画像）。**2026-11-12 に足したもの（ワールドマップ）**: `src/world/`（domain に町の四角と寄り `box.ts`・地理院の返事の読み取り `gsi.ts`、infra に `townBoxes.ts`・`placeSearch.ts`、ui に `WorldMap.tsx`・`PlaceView.tsx`・`PlaceSearch.tsx`）。記録のタブと地図のあいだの「ワールドマップ」ボタンで日本全体を開き、行った町ごとの旗（数字にまとめない・右下のボタンで出す/隠す）と地名検索から「見るだけ」の地図へ飛ぶ（`RecordMap` の `focus`・`onPinTap`、`ShopSheet` の `viewOnly`。行っていないお店は出さない）。画面に「地名検索: 国土地理院」の出典が必要（スプラッシュ・設定）。**2026-11-12 に足したもの（図鑑B・感想）**: 図鑑は案B のコレクションカード（`src/zukan/ui/`。3 列×3 段・No.・段の枠・自分の感想の星。丸い字体 M PLUS Rounded 1c は `@fontsource` で図鑑・感想の画面だけ。種類の絵と星の文字は `cardArt.ts`）。感想は `src/reviews/`（domain に決まり `review.ts`・写真の大きさ `photoFit.ts`、infra に Supabase の読み書き `reviewsApi.ts`・写真を canvas で JPEG 250KB 以下に描き直す `photo.ts`、ui に書く画面 `ReviewEditor.tsx`・わたしの感想 `MyReviews.tsx`・みんなの感想 `ReviewList.tsx`）。星 1〜5・ひとこと 500 文字・写真 1 枚・公開／非公開（SQL `0007_review_visibility.sql`、他人には hidden でない公開の感想だけを RLS が返す）。写真は非公開バケット `review-photos/{uid}/…jpg`、期限付き URL 1 時間。チェックインの演出の後に 10 秒「感想を書く」（`MapPage`）、お店のシートの全画面に「みんなの感想」。通報は `review_reports`、非表示は管理者が `hidden`。**2026-11-13 に足したもの（図鑑に地図のお店）**: 晴れた場所の地図のデータだけのお店（`osm:`）も図鑑に「？」で出す。アプリは晴れた場所の地図のお店が載るタイル（ズーム 14）の番号だけを関数 `supabase/functions/shops-osm/` に送り（`src/zukan/domain/osmTiles.ts`・`infra/osmSync.ts`、同じタイルは 7 日に 1 回・送った日は localStorage `mogumo.osmSync.<userId>`）、関数が地図を読んで `shops` に upsert する。図鑑を開くときは今の地図のお店と地図の晴れたマス（自宅のまわり・町のクリア込み）も渡す。`loadZukan` は `osm:` のジャンルを `kindFromMap` で決め、`mergeShops` でホットペッパーの店と 1 枚にまとめる。置き方 `docs/superpowers/plans/2026-11-12-zukan-osm-shops-deploy.md`。**作業を再開するときは、まず `docs/session-handoff.md`（会話の引き継ぎメモ）を読む。** 実装が進んだらこの節を更新すること。

## シロ（ミシェーラ）との連携（2026-11-06 オーナー決定。2026-11-09 にシロは「ミシェーラ」に改名。フォルダ名 to-shiro/ はそのまま）
- シロ（Muse）との情報連携は GitHub リポジトリの `handoff/` を正本にする。チャット経由の受け渡しはしない。
- **セッション開始時に `handoff/README.md` と、`handoff/to-claude/`（シロからの依頼）の未対応を確認する。** あわせて `handoff/to-shiro/`（こちらからの依頼）の進み具合も見る。
- 依頼は1依頼1ファイル（`YYYY-MM-DD-<slug>.md`、先頭に `状態: 未対応／対応中／完了`）。対応したら状態を更新し、`handoff/LOG.md` に1行残す。

## 工程（上司課題の進め方）
要件定義 → 基本設計 → 詳細設計 → 実装 → 検証 → 振り返り の順で進める。
- 決定はファイルに残す（SPEC・設計メモ）。会話の中だけで決めない。
- 作業の区切りごとに `docs/learning-log.md` へ記録する（やったこと／詰まった所／次回）。本人の感想欄は書き換えない。

## エージェントの使い方（2026-11-09 シロの提案をリーダーが公式資料で検証し、オーナーの指示で反映）
- 根拠: Claude Code 公式の best-practices・sub-agents のページ（2026-11-09 に確認）。要点は「サブは同じモデルで同じ仕事をしても答えが良くなるわけではない」「まっさらなサブは文脈を集め直すので、トークンも時間も余計にかかることがある」「行き来が多い・段をまたいで文脈を共有する仕事はメインの会話で」「サブが得なのは、並行作業・長い出力をメインから外す・書いた経緯を知らない目でのレビュー・道具を減らした読み取り専用役」。
- リーダー = メインエージェント。工程管理に加え、**設計と実装の判断を一貫して持つ**（工程ごとに役へ引き継がない。伝言ゲームを避ける）。行き来が多い実装はリーダーが直接やる。
- サブは定義ファイルの役ではなく、委任のたびに「文脈の境界」で切る。使うのは次の場合だけ:
  - (a) 探索: 大量のファイル読み・検索・ログ処理。要約だけ返させる（組み込みの Explore など）。単純な探し物は Haiku でよい。
  - (b) 長い出力や試行錯誤を伴う重い実装（Blender・画面の撮影・大きな段の実装など）を切り離したいとき。同時に1つまで、毎回まっさらから。指示には、読む場所・決まっていること・終わりの条件・短い報告の形を書き、次も必ず入れる:「設計に無い判断が要るときは勝手に決めず止めて報告する／頼まれていない書き換えをしない／APIキーをソースに書かない・.env は読まない／最後に `npm test`・`npx tsc -b`・`npm run lint` を通す」。
  - (c) 書いた経緯を知らない目でのレビュー（テスト役）。
- テスト役（tester、`.claude/agents/tester.md`）は残す。書き換えの道具（Write・Edit）を持たない。ただしテストを走らせるため Bash は持つので、「書き換えない」は指示でも明記する。モデルは Sonnet。
- サブのモデルの既定は **Sonnet**（公式: 「Sonnet は決まった作業で安い」）。Opus にするのは「設計で決め切れない判断が残る実装」「原因の分からないバグ調査」「3D など空間の考えが重い実装」の3つだけ。詰まったら途中で Opus に替えてよい。Sonnet にしたことで試行錯誤が増えていないかは `/usage` と報告で見て、増えていれば見直す。
- 計画は Plan モードや superpowers:writing-plans を使ってよい（書くのはリーダーかサブ）。

## トークンの節約（2026-11-07 オーナー決定・シロの改善案）
- リーダーは `/clear` しない（全体の流れを持つ）。大量の読み・長い出力や試行錯誤を伴う作業はサブに渡し、サブは毎回まっさらから始める（サブ自体もトークンを使うので、何でも渡さない）。小さい修正はリーダーが直接行う。
- 段（ビル・大型施設などの区切り）の終わりに、オーナーに `/compact` を頼む（公式: 長い会話では `/compact` 自体も大きな1回になるので、段の終わりにだけ）。**その前に必ずバックアップ**: `docs/session-handoff.md` を更新してコミットし、dev に反映する（今まで `/clear` の前にしていたのと同じ）。`/compact` の後ろに付ける残すものの指示は「決定事項・残件・ファイルの場所だけ残す」。
- サブへの指示には必ず次の一文を入れる:「同じ方法で2回失敗したら、別の方法に切り替えるか、先に実測して前提を確かめる。それでも進まなければ止めて報告する」。
- 金曜の振り返りで、オーナーに `/usage` を見てもらい（リーダーからは測れないため）、役ごとの割合が偏っていたら learning-log とシロへの報告に含める。
- 重いサブ（Blender・画面の撮影）は1つずつ動かす。並べて動かすのは文書だけの作業に限る。

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
- 画像・動画素材について： 開発中に画像や動画が必要になったら、外部素材やプレースホルダで勝手に済ませず、必要な素材の仕様（内容・サイズ・用途・画風）を明記して、`handoff/to-shiro/` に依頼ファイルとして書くこと。素材はシロが生成して `art/` などに置く。
