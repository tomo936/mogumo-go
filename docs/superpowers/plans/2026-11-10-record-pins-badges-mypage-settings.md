# 記録のピン・実績・マイページ・設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録の地図に行ったお店のピン（日ごと）、記録の「じっせき」タブ（約140個のバッジ）、マイページ、設定の全画面を作る。

**Architecture:** 実績は `src/badges/` に新設。domain は純粋な計算（チェックインの列・晴れたマス・自宅 → 各バッジの取れた時刻と進み具合）、ui は SVG のメダルと一覧。データの読みは今の `src/record/infra/recordApi.ts` を広げて記録と実績で共用する（サーバー・DB の変更なし。`user_badges` への保存はしない）。マイページは `src/mypage/`、設定は `src/settings/`。

**Tech Stack:** React 19 / TypeScript 7 / Vitest / MapLibre（Marker）/ Supabase（読みだけ、RLS で本人の行）

**Spec:** `docs/superpowers/specs/2026-11-10-record-pins-badges-mypage-settings-design.md`（「確定」の節が優先）

## Global Constraints

- 依存の向きは ui → infra → domain。domain は React・MapLibre・Supabase・ブラウザの API を import しない。
- 型だけの import は `import type`、import に拡張子、`enum` 禁止、未使用変数でビルドが落ちる。
- 時刻・日付は日本時間（`src/checkin/domain/day.ts` の `jstDay`）。
- 絵文字を UI に使わない（線のアイコン `src/ui/Icon.tsx`）。
- 自宅は端末の中だけ（`mogumo.home.<userId>`）。サーバーに送らない。
- ホットペッパーのクレジットは設定とスプラッシュに出す。
- 各タスクの終わりに `npm test`（ログをファイルに出して `Tests` 行と FAIL を確認）・`npx tsc -b`・`npm run lint`（警告は今の数から増やさない）。
- ジャンルの段: ★1 クリーム「はじめての〇〇」1回 / ★2 銅「〇〇好き」3回 / ★3 シルバー「〇〇通」10回 / ★4 ゴールド「〇〇名人」30回 / ★5 虹「〇〇マスター」50回。
- **★の数とメダルの色は1対1**（★1 クリーム・★2 銅・★3 シルバー・★4 ゴールド・★5 虹）。★は「むずかしさ」。ジャンル以外も同じ決まり（設計メモの「チャレンジ系の段」の書き方をこれで具体化。リーダーの判断）。

## Review Focus

1. 行ったお店の位置（lat/lng）が無い・shops に無いチェックイン → ピンも実績も落ちずにその行だけ飛ばす。
2. 自宅が無い（別の端末・未設定）→ 遠征・四方八方は「取れていない」扱いで、条件の文に「自宅を設定すると数えます」と出す。落ちない。
3. 日本時間の日付の境目（UTC 15:00 前後）→ はしご・連続・年越しそば・ゾロ目が日本時間で数える。
4. スライダーを行った日の無い所に置いたとき → ピンは「それまで」の小さいものだけ、番号なし。‹ › は前後の行った日に跳ぶ。端では止まる。
5. ニックネームの変更が空白・11文字以上・保存失敗 → 保存しない・エラーを出す・元の名前のまま。

---

### Task 1: 記録のデータを広げる

**Files:**
- Modify: `src/record/domain/timeline.ts`（`VisitEntry` に項目を足す）
- Modify: `src/record/infra/recordApi.ts`
- Test: `src/record/infra/recordApi.test.ts`（無ければ作る）、既存の `timeline.test.ts`・`Record.test.tsx` のデータを直す

**Interfaces:**
- Produces:
  - `VisitEntry = { shopId; name; kind; photoUrl; day; at: number /*ms*/; lat: number | null; lng: number | null; wasHint: boolean; mysteryHint: boolean }`
  - `loadRecord(client?) → Promise<{ cells: ClearedCell[]; visits: VisitEntry[] }>`（visits は `at` の古い順）

- [ ] Step 1: テスト `loadRecord は時刻・位置・気配を返す`: checkins `[{checkin_id:'c1', shop_id:'hp:A', checked_in_at:'2026-11-06T03:10:00Z', was_hint:true}]`、shops `[{shop_id:'hp:A', name:'麺屋', genre_code:'G013', photo_url:null, lat:35.6, lng:139.6}]`、daily_hints `[{completed_checkin_id:'c1', is_mystery:true}]` → `visits[0]` が `{ at: Date.parse('2026-11-06T03:10:00Z'), lat:35.6, lng:139.6, wasHint:true, mysteryHint:true, day:'2026-11-06' }` を含む。shops に lat が無い行は `lat:null`。
- [ ] Step 2: 失敗を確認。
- [ ] Step 3: 実装。checkins は `'checkin_id, shop_id, checked_in_at, was_hint'` を `checked_in_at` の順で読む。shops は `'shop_id, name, genre_code, photo_url, lat, lng'`。daily_hints は `readAll(c,'daily_hints','completed_checkin_id, is_mystery',['hint_date'])` を読み、`is_mystery && completed_checkin_id` の checkin_id を集合にする。テスト用の Client 型に合うよう readAll はそのまま使う。
- [ ] Step 4: テストを通す（既存テストのデータに新項目を足す）。
- [ ] Step 5: Commit `feat(record): load visit time, location and hint flags`

### Task 2: 記録の地図に日ごとのピン

**Files:**
- Create: `src/record/domain/dayPins.ts` / Test: `src/record/domain/dayPins.test.ts`
- Modify: `src/record/ui/RecordMap.tsx`・`src/record/ui/Record.tsx`・`src/record/ui/record.css`・`src/record/ui/Record.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `VisitEntry`
- Produces:
  - `type DayPin = { shopId: string; name: string; kind: ShopKind; lat: number; lng: number; today: boolean; order: number | null; lastDay: string }`
  - `pinsAt(visits: VisitEntry[], t: number): DayPin[]` — t の日（日本時間）までに行ったお店を1店1つ。t の日に行った店は `today:true`、`order` はその日の中の時刻順で 1 から。他は `order:null`。lat/lng が null の店は入れない。
  - `stepVisitDay(t: number, dir: 1 | -1, visits: VisitEntry[], range: {start;end}): number` — t の日より後（前）で行った日のうち一番近い日の「その日の最後の訪問の時刻」を range に収めて返す。無ければ t のまま。visits が空なら `stepWeek` と同じ。
  - `visitsOnDay(visits, t): VisitEntry[]`（時刻順）
  - `RecordMap` の Props に `pins: DayPin[]` を足す。

- [ ] Step 1: テスト（dayPins.test.ts）:
  - `pinsAt: 同じ日の2軒に順番、前の日の店は小さい`: A 11/5 10:00JST、B 11/6 12:10JST、C 11/6 15:40JST、t=11/6 20:00JST → B `{today:true, order:1}`、C `{order:2}`、A `{today:false, order:null}`。
  - `pinsAt: 同じ店に2回は1つ`: A を 11/5 と 11/6 → 1件で today:true。
  - `pinsAt: 日本時間の境目`: 2026-11-05T15:30Z（JST 11/6 0:30）の訪問は t=11/6 正午で today。
  - `pinsAt: 位置の無い店は出ない`。
  - `stepVisitDay: 行った日へ跳ぶ・端で止まる`: 行った日 11/1・11/6、t=11/3 → +1 は 11/6 の最後の時刻、-1 は 11/1。t=11/6 で +1 は t のまま。
- [ ] Step 2: 失敗を確認。
- [ ] Step 3: 実装。RecordMap: `pins` が変わったら Marker を作り直す（地図は作り直さない）。要素は `button.rc-pin`（今日のは `rc-pin--today`、中に `<img>` ピンの絵 `src/assets/pins/<kind>.png`、mystery は other の絵＝既存の `shopPins.ts` と同じ選び方、番号は `<b class="rc-pin__num">`）。押すと `div.rc-pin__tag` に「店名 ・ M/D」（もう一度押すと閉じる、別のピンで切りかえ）。CSS は必ず `position:absolute`（マーカーの決まり）。今日のピン 40px・ぽんと弾む animation（1回）、他 22px・opacity .75。
  Record: ‹ › を `stepVisitDay` に、aria-label を「前の行った日」「次の行った日」。見出しを「M/D（曜）　N軒」（N は `visitsOnDay` の数。0 なら日付だけ）。地図の下に `visitsOnDay` が1件以上なら「この日に行ったお店」の小さい一覧（丸数字は使わず `1` などの番号の丸、店名、時刻 HH:MM）。
- [ ] Step 4: Record.test に `‹ › は行った日へ跳ぶ`（見出しの日付が変わる）を足す。RecordMap は今のテストどおりモック。
- [ ] Step 5: テスト・型・lint を通して Commit `feat(record): day pins on the record map, step by visit day`

### Task 3: 実績の計算（domain）

**Files:**
- Create: `src/shops/domain/kindLabel.ts`（`KIND_LABEL: Record<ShopKind,string>`。今 `Zukan.tsx`・`ZukanDetail.tsx` にある表をここへ移し、2つはこれを import）
- Create: `src/badges/domain/types.ts`・`src/badges/domain/catalog.ts`・`src/badges/domain/evaluate.ts`
- Test: `src/badges/domain/evaluate.test.ts`・`src/badges/domain/catalog.test.ts`

**Interfaces:**
- Produces:
  - `type Tier = 'cream' | 'bronze' | 'silver' | 'gold' | 'rainbow'`、`tierOf(stars: 1|2|3|4|5): Tier`
  - `type BadgeGroup = 'genre' | 'explore' | 'regular' | 'fog' | 'far' | 'rhythm' | 'hashigo' | 'hint' | 'season' | 'quirky'`、`GROUP_LABEL`（ジャンル／開拓／常連／霧はらい／遠征／毎日・リズム／はしご／気配／季節・記念日／ちょっと変わった）
  - `type BadgeIcon = 'walk' | 'store' | 'cloud' | 'flag' | 'compass' | 'calendar' | 'bowls' | 'hint' | 'sun' | 'moon' | 'clock' | 'heart' | 'gift' | 'leaf' | 'star'`
  - `type BadgeVisit = { shopId: string; kind: ShopKind; at: number; lat: number | null; lng: number | null; wasHint: boolean; mysteryHint: boolean }`
  - `type BadgeInput = { visits: BadgeVisit[]; cellTimes: number[]; home: { lat: number; lng: number } | null }`
  - `type BadgeDef = { id: string; group: BadgeGroup; name: string; how: string; stars: 1|2|3|4|5; secret: boolean; art: { kind: ShopKind } | { icon: BadgeIcon }; needsHome?: true; metric: (i: Prepared) => { times: number[] } | { at: number | null }; need?: number }`（`times` を返す物は「need 番目の時刻＝取れた時刻、length＝今の数」）
  - `type BadgeState = { def: BadgeDef; earnedAt: number | null; have: number | null; need: number | null }`
  - `CATALOG: BadgeDef[]`、`evaluate(input: BadgeInput): BadgeState[]`（CATALOG の順）、`recentEarned(states, n): BadgeState[]`（earnedAt の新しい順）

- 中身（CATALOG。名前・条件は確定。how は「〇〇に N 回行く」などの短い文）:
  - genre: 18 種類（`KIND_ORDER` の順）× [1,3,10,30,50]、★1〜5、名前「はじめての{L}」「{L}好き」「{L}通」「{L}名人」「{L}マスター」。L は KIND_LABEL、ただし mystery は「なぞ」。art は `{kind}`。
  - explore: はじめの一歩（1軒目 ★1）、新しいお店 10/30/100/300 軒（新米たんけん家★1・たんけん家★2・開拓王★3・グルメ大王★4）、七変化（7種類 ★2）、ぜんぶ食べた（18種類 ★4）。
  - regular: 同じ店に 3/10/30 回（顔なじみ★1・常連さん★2・お店の家族★4）、行きつけ5（3回以上の店が5軒 ★3）。
  - fog: 晴れた広さ 0.1/1/5/10 km²（そよ風★1・霧はらい★2・晴れわたり★3・青空の主★4）。マス数＝km² ÷ 0.000625（`areaKm2` と同じ換算、切り上げ）。
  - far（needsHome）: 自宅から 1/3/10 km のお店（ご近所たんけん★1・遠征隊★2・大遠征★4）、四方八方（自宅から 1km 以上先の店を北・東・南・西の4つの向き（45° ずつ区切る）すべてで ★3）。
  - rhythm: 3/7/30 日つづけて（つづけてグルメ★1・毎日グルメ★3・グルメの鬼★5）、ひと月に20軒（同じ月 20 回 ★3）、お昼の常連（平日 11:00〜13:59 に 10 回 ★2）、週末グルメ（土日に 10 回 ★2）。
  - hashigo: 1日に 2/3/5 軒（はしご★1・はしご上手★2・食い倒れ★4）、フルコース（同じ日に4種類 ★3）、世界一周（同じ日に和〔washoku・sushi・soba・donburi〕・洋〔western・burger〕・中〔chinese〕★3）。
  - hint: 気配のお店に 1/5/20/50 回（はじめての気配★1・気配ハンター★2・気配の達人★3・千里眼★4）、なぞの気配（mysteryHint 1回 ★2）。
  - season（secret）: 年越しそば（12/31 に soba ★3）、メリークリスマス（12/24〜25 に cake ★3）、バレンタイン（2/14 に cake か cafe ★3）、四季のグルメ（3-5・6-8・9-11・12-2 月のすべてで1回以上 ★4）、1周年（はじめての訪問から365日以上たってから訪問 ★4）。
  - quirky（secret）: 朝ごはん隊（9:00 前 ★2）、夜ふかしグルメ（22:00 以降 ★2）、ひとすじ（同じ店に3日つづけて ★3）、甘いもの別腹（同じ日に cake/cafe/bakery と それ以外 ★2）、ラーメンのはしご（同じ日に ramen 2 回 ★2）、ゾロ目（時刻 11:11・22:22・00:00 ★3）、なぞの常連（mystery に 5 回 ★2）、記念の100回（100 回目の訪問 ★3）。

- [ ] Step 1: テスト（evaluate.test.ts。訪問を作る小さい関数 `v(kind, isoJst, opts?)` を置く）:
  - `ジャンルの段: ラーメン3回で★1と★2、★3は have 3 / need 10`
  - `はしご上手は日本時間の同じ日の3軒`（JST 23:50 と翌 0:10 は別の日）
  - `毎日グルメ: 7日つづけた日の時刻で取れる、1日空くと数え直し`
  - `霧はらい: マスの時刻の 1600 番目で 1km²`
  - `自宅が無ければ遠征は取れず have null`
  - `四方八方: 北東南西 1km 先で取れる、3方向では取れない`
  - `年越しそば: 12/31 JST の soba`、`ゾロ目: 11:11 JST`
  - `recentEarned は新しい順に n 個`
  - catalog.test.ts: `id が重複しない`、`ジャンルは 90 個`、`stars と tierOf がそろう（1→cream … 5→rainbow）`、`どの名前も空でない`。
- [ ] Step 2: 失敗を確認。
- [ ] Step 3: 実装。`Prepared` は visits を時刻順に並べ、日本時間の日・時・分・曜日・月をあらかじめ付けたもの（evaluate の中で1回作る）。距離は `src/map/domain/geo.ts` にある距離の関数を使う（無ければ同じ domain に小さく書く）。
- [ ] Step 4: テストを通す。
- [ ] Step 5: Commit `feat(badges): achievement catalog and evaluation`

### Task 4: バッジの見た目と「じっせき」タブ

**Files:**
- Create: `src/assets/badges/food/<kind>.webp`（18枚。`art/pins/icons/pin-<kind>.png` を 128px に縮めた webp。mystery は `pin-mystery.png`。作り方: `ffmpeg -i in.png -vf scale=128:-1 -c:v libwebp -quality 85 out.webp`）
- Create: `src/badges/ui/BadgeMedal.tsx`・`src/badges/ui/BadgeList.tsx`・`src/badges/ui/badges.css`
- Modify: `src/ui/Icon.tsx`（`BadgeIcon` の 15 個の線のアイコンを足す）、`src/record/ui/Record.tsx`（タブ）
- Test: `src/badges/ui/BadgeList.test.tsx`、`Record.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `evaluate`・`BadgeState`・`GROUP_LABEL`・`tierOf`
- Produces:
  - `BadgeMedal({ state: BadgeState; size?: number })` — SVG のメダル。見本 `art/prototypes/badge-medal.html`（このタスクで、2026-11-10 の見本 badge5.html を写して置く）の形: ギザギザのふち（22 山）、二重のふち、放射の模様、白ふちの絵、名前のリボン、★の数（塗りは #ffcc33・ふち #7a4a1c）。色は `tierOf(stars)` の5色（見本の値）。虹だけキラ3つ。取れていない物は灰色（saturate 0・不透明度 .45）。ひみつで取れていない物は絵を「？」、リボンを「？？？」。SVG の id は `useId()` で重ならないようにする。
  - `BadgeList({ states: BadgeState[]; hasHome: boolean })` — グループごとの見出し（GROUP_LABEL と「取れた数 / 全部」）、4列の格子。押すと下から小さいシート: メダル大きく・名前・条件（how）・取れた日（YYYY.MM.DD）か「あと N」（have/need）・自宅が要る物で自宅が無ければ「自宅を設定すると数えます」。ひみつで取れていない物は条件も「？？？」。
  - Record: 上に「きろく｜じっせき」のタブ（role="tablist"）。じっせきは `evaluate({ visits, cellTimes: cells.map(c=>c.at), home })` を `useMemo` で。

- [ ] Step 1: テスト: `BadgeList はグループと数を出す`、`押すと条件と「あと N 回」`、`ひみつは取るまで ？？？`、`自宅が無いと遠征に案内文`、Record.test に `じっせきのタブに切りかえるとバッジが出る`。
- [ ] Step 2: 失敗を確認。
- [ ] Step 3: 実装。
- [ ] Step 4: テスト・型・lint。
- [ ] Step 5: 画面の撮影（`.superpowers/preview/` の rec のプレビュー、または ck.html → 記録）で、メダルが見本どおりか目で確かめる。
- [ ] Step 6: Commit `feat(badges): SVG medals and achievements tab`

### Task 5: マイページ

**Files:**
- Create: `src/mypage/ui/MyPage.tsx`・`src/mypage/ui/ChangeHome.tsx`・`src/mypage/ui/mypage.css`・`src/mypage/infra/coins.ts`
- Modify: `src/setup/infra/profileRepo.ts`（`updateNickname`）と各テストの替え玉、`src/map/ui/MapHud.tsx`（マイページ → `onMyPage`）、`src/routes/MapPage.tsx`
- Test: `src/mypage/ui/MyPage.test.tsx`・`src/mypage/infra/coins.test.ts`・profileRepo のテスト

**Interfaces:**
- Consumes: `loadRecord`（Task 1）、`evaluate`・`recentEarned`（Task 3）、`BadgeMedal`（Task 4）、`levelFor`・`needFor`（`src/zukan/domain/level.ts`）、`validateNickname` 系（`src/setup/domain/nickname.ts` の今の関数）、`HomePickerMap`・`getCurrentLocation`・`saveHome`
- Produces:
  - `ProfileRepo.updateNickname(userId: string, nickname: string): Promise<void>`（`profiles.update({ nickname }).eq('user_id', userId)`、失敗で throw）
  - `loadCoins(client?): Promise<number>`（`coin_ledger` の `amount` の合計。ページを分けて全部読む）
  - `MyPage({ userId; nickname; starterId; home; onNicknameChanged(n: string); onOpenBadges(); onClose() })`
  - `ChangeHome({ userId; onSaved(); onCancel() })`

- 画面: 上のカード（キャラの絵・ニックネーム＋鉛筆・Lv・次の Lv までのバーと「あと N 軒」）、数字のカード4つ（行ったお店・晴れた広さ km²・実績の数・グルメコイン）、「最近とった実績」3つ（無ければ「まだありません」）と「すべて見る ›」（記録をじっせきタブで開く）、「自宅の場所を変える」。
- ニックネームの変更: その場で入力欄。保存は今のニックネームの検査（1〜10 文字・空白だけは不可）を通ったときだけ。失敗は role="alert" で「保存できませんでした」、名前は元のまま。
- 自宅の変更: ChangeHome（全画面、HomePickerMap＋「現在地へ」＋「ここにする」）。保存したら `saveHome` して `window.location.reload()`（地図・霧が自宅を最初に読む作りのため。リーダーの判断）。
- MapPage: `recordOpen` を `'record' | 'badges' | null` にして、マイページの「すべて見る」で記録をじっせきタブで開く（Record に `initialTab` を足す）。

- [ ] Step 1: テスト: `ニックネームを変えると updateNickname と onNicknameChanged`、`11文字は保存しない`、`保存に失敗したら alert と元の名前`、`数字とコインを出す`、`最近の実績3つ`、coins.test `amount を合計する（2ページ）`、profileRepo `updateNickname は profiles を更新`。
- [ ] Step 2〜4: 失敗確認 → 実装 → 通す。
- [ ] Step 5: Commit `feat(mypage): my page with nickname, stats, recent badges and home change`

### Task 6: 設定の全画面

**Files:**
- Create: `src/settings/config.ts`（`CONTACT_FORM_URL: string | null = null`、`APP_VERSION = '0.1.0'`）、`src/settings/ui/Settings.tsx`・`src/settings/ui/settings.css`
- Modify: `src/map/ui/MapHud.tsx`（`settings: ReactNode` をやめて `onSettings` に）、`src/routes/MapPage.tsx`、`src/map/ui/map.css`（不要になった `.hud-settings*`・`.hud-screen*` を消す。ほかで使っていないことを grep で確かめてから）
- Test: `src/settings/ui/Settings.test.tsx`・MapHud のテスト

**Interfaces:**
- Produces: `Settings({ email: string | null; pinsHidden: boolean; onTogglePins(); onSignOut(); onClose() })`
- 項目（設計メモ「確定」・設定の項目の順）:
  - サウンド「準備中」: BGM・効果音（つまみは押せない見た目）。
  - 地図: お店のピンを出す（スイッチ。role="switch"・aria-checked）。軽量モードは「準備中」（何を軽くするかの作りが要るので今回は枠だけ。リーダーの判断）。
  - お知らせ「準備中」: 今日の気配が届いたら知らせる。
  - アカウント: 「Google でログイン中」とメール、ログアウト。
  - サポート: 遊び方をもう一度見る・よくある質問（準備中）、お問い合わせ・不具合の報告（`CONTACT_FORM_URL` があれば新しいタブで開く `<a target="_blank" rel="noopener noreferrer">`、null なら「準備中」）。
  - プライバシー: 位置情報の使い方（押すと説明の短い文を開閉: 「現在地はお店までの距離と霧を晴らすことにだけ使います。自宅の場所はこの端末の中だけに保存し、サーバーには送りません。」）、プライバシーポリシー（準備中）。
  - このアプリについて: 利用規約（準備中）、出典・クレジット（今の `CreditsButton` を使う）、「Powered by ホットペッパーグルメ Webサービス」（リンク http://webservice.recruit.co.jp/ 、新しいタブ）、バージョン `APP_VERSION`。
  - 退会「準備中」。
  - 「準備中」の項目を押すと何もしない（`aria-disabled="true"`）。
- [ ] Step 1: テスト: `ピンのスイッチで onTogglePins`、`ログアウトで onSignOut`、`お問い合わせは URL が無ければ準備中`、`ホットペッパーの表示がある`、`位置情報の説明が開く`。
- [ ] Step 2〜4: 失敗確認 → 実装 → 通す。
- [ ] Step 5: Commit `feat(settings): full settings screen`

### Task 7: 仕上げ（見た目の確認・文書・依頼）

- [ ] Step 1: プレビューで、記録（ピン・‹ ›）・じっせき・マイページ・設定を撮影し、オーナーに PNG で送る。
- [ ] Step 2: `handoff/to-shiro/2026-11-10-badge-art.md`（状態: 未対応）: メダルの正式な絵（5色のふち・リボン・★、料理の絵の入る窓 128px、ジャンル以外のアイコン 15 種）、用途・大きさ（一覧 72px、詳細 160px）、画風（スプラッシュに合う、鮮やか・アニメ調）、今の見本 `art/prototypes/badge-medal.html`。`handoff/LOG.md` に1行。
- [ ] Step 3: SPEC にバッジの条件・表示場所の決定を1行、CLAUDE.md の現状に `src/badges/`・`src/mypage/`・`src/settings/` を足す、`docs/session-handoff.md`・`docs/learning-log.md` を更新。
- [ ] Step 4: tester にレビューを頼む（書き換えない・`npm test`/`tsc`/`lint` を走らせる）。指摘を直す。
- [ ] Step 5: Commit → dev に反映。
