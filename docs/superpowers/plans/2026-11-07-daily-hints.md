# 気配・デイリー（今日の気配3件）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「探索」ボタン → 探索シートで、その日初めて開いたときに今日の気配3件を作り（端末が候補、サーバーが抽選）、霧の中のピン・ヒントのシート・30m の明かし・気配の店で +10（合計40）までを、開発用 `mogumo-go-dev` で動かす。

**Architecture:** 端末の `src/hints/`（domain＝候補集め・文・明かし・速さと探し直しの判定、infra＝Supabase/Edge Function・localStorage・HTML マーカー、ui＝ボタン・シート・`useDailyHints`）と、サーバーの Edge Function `daily-hints`（`core.ts` 純粋計算＋`index.ts`）、SQL 0004（`generation` 列・`create_daily_hints`・`perform_checkin` の置き換え）。チェックインは `checkin` 関数が `p_alt_shop_id` で hp/osm のずれを確かめ、`perform_checkin` が `daily_hints` を見て +10 を決める。

**Tech Stack:** React 19 / TypeScript 7 / MapLibre GL（`Marker`）/ Supabase（Postgres・RLS・Edge Functions＝Deno）/ Vitest＋Testing Library

**Spec:** `docs/superpowers/specs/2026-11-07-daily-hints-design.md`（以下「設計」。§番号は設計の節）

## Global Constraints
- CLAUDE.md のツールチェーンの注意: `import type`・import に拡張子・`enum`/`namespace`/パラメータプロパティ禁止・未使用の変数と引数でビルドが落ちる。
- `src/hints/domain/` は React・MapLibre・Supabase・ブラウザ API を import しない。使ってよいのは `src/map/domain/geo.ts`・`src/fog/domain/clearing.ts`・`src/checkin/domain/day.ts`・`src/shops/domain/shop.ts`・`src/shops/domain/merge.ts`（どれも domain）と `src/hints/config.ts` だけ。`src/hints/config.ts` は何も import しない。
- 自宅の座標・現在地・距離・方角・速さ・晴れたセルを `daily-hints` に送らない（本文は `regen`・`hp`・`osm` の3項目だけ）。Edge Function は候補の一覧・位置・ユーザー id・トークンをログに出さない（`console.error('daily-hints failed')` のような固定の文だけ）。
- service_role キーはブラウザに入れない。`daily-hints` はホットペッパーの鍵を使わない。
- 店名は、30m 以内で明かす・達成する まで、探索シート・ヒントのシート・お店のシート・ビルの一覧・ピンのどこにも出さない。
- 日の区切りは日本時間0時。どの日かの正本はサーバー（`jstDay(new Date())`）。
- 調整値（設計 §11、値はこのまま）:
  - サーバー `daily-hints/core.ts`: `HINT_COUNT = 3`、`HINT_MYSTERY_DAY_RATE = 0.25`、`HINT_MYSTERY_PER_DAY = 1`、`HINT_MYSTERY_VERIFY_TRIES = 3`、`HINT_CATCH_MAX_CHARS = 14`、`HINT_MAX_HP_CANDIDATES = 100`、`HINT_MAX_OSM_CANDIDATES = 50`、`HINT_REGEN_MIN_M = 1500`、`MATCH_M = 40`
  - 端末 `src/hints/config.ts`: `HINT_HOME_RADIUS_M = 1000`、`HINT_AWAY_RADIUS_M = 1000`、`HINT_FAST_KMH = 15`、`HINT_REVEAL_M = 30`、`HINT_READY_TIMEOUT_MS = 30000`、`HINT_DAY_CHECK_MS = 60000`、`HINT_NONE_GUIDE_COUNT = 3`、`REVEAL_BANNER_MS = 3000`、`HINT_MAX_HP_CANDIDATES = 100`、`HINT_MAX_OSM_CANDIDATES = 50`、`HINT_REGEN_MIN_M = 1500`、さらにこの計画で決める `HINT_SPEED_WINDOW_MS = 20000`（速さを測る時間の幅）・`HINT_SLOW_HOLD_MS = 30000`（速かったあと、遅い状態がこれだけ続けば作る）
- 決まった文（設計のとおり）: 「探索」「今日の気配」「気配を探しています…」「降りたら今日の気配が出るよ」「いまは気配を探せません」「気配を読み込めませんでした」「もう一度」「この辺りで探し直す」「降りてから探し直してね」「この辺りには気配がありませんでした」「気配は毎日0時に入れかわります」「今日は気配なし」「近くのまだ行っていないお店」「近くにまだ行っていないお店はありません」「正体は行ってみてのお楽しみ」「近づくと正体が分かるよ（30m）」「謎の気配」「気配の店 +10」「？？？」「Powered by ホットペッパーグルメ Webサービス」。時間切れは「いまは気配を探せません。少し歩いてから開き直してね」。
- 本番（main）には出さない。SQL・関数の反映は開発用 `mogumo-go-dev` だけ（Task 16。リーダーとオーナーが行う）。

### この計画で設計から変えた点（実装役はこちらに従う）
1. **地図タイルの読み方の共有（設計 §6.3 の `_shared/osmTile.ts`）→ 各関数のフォルダに同じ `osmTile.ts` を置く。** Edge Function はダッシュボードのエディターで「`index.ts`＋同じフォルダのファイル」を貼って置いている（`docs/superpowers/plans/2026-11-06-hotpepper-checkin-deploy.md`）ので、`../_shared/` の import は置けない見込み。`checkin/osmTile.ts` と `daily-hints/osmTile.ts` は同じ中身にし、Vitest で「2つの中身が同じ」ことを確かめる。`daily-hints/core.ts` も `checkin/core.ts` を import せず、要る純粋関数（`jstDay`・`distanceM`・`tilesToTry`・`findPoi`・`PoiFeature`・`normalizeName`）を写して `keep in sync` と書き、同じ答えを返すテストで守る。
2. 明かした記録 `mogumo.hintsRevealed.<userId>` は `{ day, generation, ids }`（設計は `{ day, ids }`）。作り直しで捨てるのを判定するため。
3. 速さは GPS の `coords.speed` を使わず、`MapView` の `onPosition`（ならした位置）を受けた時刻との差から出す（設計 §14 で作る人に任せた点）。測れない（点が2つ未満・幅5秒未満）は「遅い」とみなす。初めて開いたときに遅ければすぐ作り、一度速いと判定したら `HINT_SLOW_HOLD_MS` 遅い状態が続くまで待つ。
4. 端末でも、ホットペッパーの読み込みに失敗して `osm:Y` だけになった気配の店（気配は `hp:X`）を伏せるため、`matchesShop` は「id・mapId が同じ」に加え「`hp:` の気配と `osm:` の店で、40m 以内かつ `normalizeName` が互いを含む」も同じ店とみなす（設計 §5.3 のサーバーの照合を端末の伏せにも使う）。
5. 距離の表示は 1000m 以上も「約1050m」のように m のまま（設計に指定なし）。

## Review Focus
1. **SQL 0004 を流す前の dev**（Task 16 の手順1〜2の間）: `checkin` が `was_hint` を返さない・`daily_hints` に `generation` 列が無い・`daily-hints` 関数が無い。アプリは落ちず、チェックインは今までどおり（+30）、探索シートは「気配を読み込めませんでした」。→ Task 7（`was_hint` が無ければ false）と Task 9（読み取りの失敗は `ok:false`）のテスト。
2. **ホットペッパーの読み込みが失敗した日に、気配の店（`hp:X`）が `osm:Y` だけで地図に出る**: お店のシート・ビルの一覧で店名が出ない。→ Task 8 `matchesShop` のテスト（変えた点4）。
3. **30〜50m で、伏せたままチェックイン**: シートの名前は「？？？」のまま、演出の帯に正体が出る。チェックインが失敗（too_far など）したら正体を出さない。→ Task 13 のテスト。
4. **日付が変わった直後に探索シートを開く**（端末の時計で日付が変わったが、サーバーの返す `hint_date` を正本にする）: 昨日のピン・明かした記録が残らない。→ Task 11 のテスト（`hint_date` が今日でない組を読んだら捨てる・`revealStore` は日が違えば空）。
5. **作り直しの 409（`regen_used`・`regen_done`・`not_far`）と、作り直しで0件**: ボタンが消え、今の組がそのまま出る。古い組のピンが残らない・新しい組のピンだけになる。→ Task 11 のテスト。

---

### Task 0（リーダー）: 地図にもともとある店名の文字を確かめる（設計 §7.6）

- [x] dev の地図（`npm run dev`、`?fake`）で、霧の中のお店の位置に OpenFreeMap の `poi` の文字（店名）が見えるかを撮って確かめる。
- [x] 見える → Task 1 を行う。見えない → Task 1 は飛ばし、`docs/session-handoff.md` に「poi の文字は見えなかった（2026-11-07）」と書く。

### Task 1: 地図の `poi` の文字を消す（Task 0 で「見える」ときだけ）

> 2026-11-07 実施せず: Task 0 で見えなかった（positron に `poi` の層が無い）。

**Files:**
- Modify: `src/map/infra/theme.ts`（`themeLayer` の symbol の分岐）, `src/map/infra/theme.test.ts`

- [ ] **Step 1: テストを書く** `theme.test.ts` の `base()` に `{ id: 'poi_r1', type: 'symbol', source: 'x', 'source-layer': 'poi' }` を足し、`poi の文字の層は隠す`（`layout.visibility === 'none'`）。
- [ ] **Step 2:** `npx vitest run src/map/infra/theme.test.ts` → FAIL
- [ ] **Step 3:** 実装。symbol で `src === 'poi'` なら `hide(l)`。
- [ ] **Step 4:** `npx vitest run src/map/infra` → PASS。`npm run dev` の `?fake` で、霧の外のお店（3D の建物とピン）が今までどおり出ることを撮って確かめる（`mapShops.ts` は `querySourceFeatures` で `poi` を読むため）。出なくなったら、隠すのをやめて `paint` の `text-opacity: 0` と `icon-opacity: 0` にする（テストもそれに直す）。
- [ ] **Step 5:** commit `feat(map): hide poi labels so hint shop names stay hidden`

### Task 2: SQL 0004（`generation`・`create_daily_hints`・`perform_checkin` の置き換え）

**Files:**
- Create: `supabase/migrations/0004_daily_hints.sql`
- 参考に読む: `supabase/migrations/0002_checkin.sql`・`0003_checkin_once_a_day.sql`（`perform_checkin` の今の中身と、revoke/grant の書き方）

**Interfaces:**
- Produces:
  - `daily_hints.generation smallint not null default 1 check (generation between 1 and 2)`。一意制約 `daily_hints_user_day_gen_slot_key (user_id, hint_date, generation, slot)`・`daily_hints_user_day_gen_shop_key (user_id, hint_date, generation, shop_id)`
  - `public.create_daily_hints(p_user uuid, p_day date, p_regen boolean, p_rows jsonb) returns setof public.daily_hints`（今の組を slot 順）。`p_rows` は `[{ "slot": 1, "shop_id": "hp:…", "hint_genre": …, "hint_catch": …, "hint_budget": …, "is_mystery": false }, …]`。エラーは `raise exception '<code>' using errcode = 'P0001'`、code は `no_hints`・`regen_used`・`regen_done`。プロフィールが無いときは 0002 と同じ `profile_missing`（errcode 23503）
  - `public.perform_checkin(p_user uuid, p_shop_id text, p_far boolean, p_day date, p_cells jsonb, p_alt_shop_id text) returns table (checkin_id uuid, coins_awarded int, new_cells jsonb, was_hint boolean)`

- [x] **Step 1:** ファイルの先頭のコメントに、設計 §10「DB（手で確かめる）」の確かめ方を SQL の例つきで書く（同じ日に2回で1組、作り直しで generation 2・古い組が残る、2回目は `regen_used`、達成後は `regen_done`、気配の店で 30＋10 の2行・`was_hint = true`・`completed_checkin_id`、気配でない店・作り直す前の組の店・昨日の気配は 30 だけ、他人の行は読めない、authenticated から2つの関数を実行できない）。0001 の一意制約の今の名前を確かめる問い合わせ（`select conname from pg_constraint where conrelid = 'public.daily_hints'::regclass;`）も書く。
- [ ] **Step 2:** 本体を書く。全体を `begin; … commit;` で囲み、**何度流しても同じ結果**にする（`add column if not exists`、`drop constraint if exists daily_hints_user_id_hint_date_slot_key` と `…_shop_id_key`（0001 の自動の名前）と新しい2つ、の順に落としてから新しい2つを add）。
  - `create_daily_hints`: 設計 §5.2 の 2 の流れどおり（`profiles` を `FOR UPDATE` → その日の `max(generation)` → regen の分岐）。`p_rows` が空のときは何も書かず今の組を返す。`security definer`・`set search_path = ''`・テーブルは `public.` を付けて書く。`revoke all on function … from public, anon, authenticated; grant execute … to service_role;`
  - `perform_checkin`: `drop function if exists public.perform_checkin(uuid, text, boolean, date, jsonb);` と新しい形の `drop function if exists`（再実行用）のあとに作る。0003 の中身に、設計 §5.2 の 3 の ★（気配の行を一番大きい generation から `shop_id in (p_shop_id, p_alt_shop_id)`・未達成で `FOR UPDATE`、`checkins.was_hint`、`coin_ledger` に `hint_bonus` 10、`daily_hints.completed_checkin_id`、戻り値 `was_hint`）を足す。権限は 0002 と同じ。
- [x] **Step 3: 確かめる** この段階では DB で動かせない（反映は Task 16）。次を読み合わせる: ①`drop function` の引数の型が 0003 の定義と完全に同じ ②`hint_bonus` は 0001 の CHECK（金額 10・`checkin_id` 必須）に合う ③`create_daily_hints` の regen=false で行があるときは何も書かない ④どちらの関数も `set search_path = ''`。
- [ ] **Step 4:** commit `feat(db): daily hints generation and hint bonus (0004)`

### Task 3: 地図タイルの読み方を `osmTile.ts` に分ける（`checkin` の動きは変えない）

**Files:**
- Create: `supabase/functions/checkin/osmTile.ts`, `supabase/functions/daily-hints/osmTile.ts`（同じ中身）, `supabase/functions/daily-hints/core.ts`（この Task では写した純粋関数だけ）, `supabase/functions/daily-hints/core.test.ts`
- Modify: `supabase/functions/checkin/index.ts`（`fetchTilePois`・`verifyOsm`・`UpstreamError`・`Z`・`EDGE_M`・`TILEJSON` を移して import）

**Interfaces:**
- Produces（`osmTile.ts`。Deno 専用、`npm:` の import あり。`./core.ts` から `tilesToTry`・`findPoi`・`type PoiFeature` を import）:
  - `export class UpstreamError extends Error {}`
  - `export async function verifyOsm(shopId: string, lat: number, lng: number): Promise<{ name: string; subclass: string; lng: number; lat: number } | null>` — 今の `checkin/index.ts` のものをそのまま
- Produces（`daily-hints/core.ts`。`checkin/core.ts` から写す。先頭に `// keep in sync: supabase/functions/checkin/core.ts` ）: `jstDay`・`distanceM`・`tileXY`・`tilesToTry`・`findPoi`・`type PoiFeature`・`type LatLng`。`normalizeName(name: string): string` と `namesMatch(a: string, b: string): boolean`（`src/shops/domain/merge.ts` の `normalizeName` と `namesContain` を写す。`// keep in sync: src/shops/domain/merge.ts`）。`checkin/core.ts` にも同じ `normalizeName`・`namesMatch` を足す（Task 6 で使う）。

- [x] **Step 1: テストを書く** `daily-hints/core.test.ts`:
  - `osmTile.ts は checkin と daily-hints で同じ中身`（`node:fs` の `readFileSync` で2つを読んで `toBe`）
  - `写した関数は checkin/core.ts と同じ答え`: `jstDay(new Date('2026-11-07T15:00:00Z'))` が両方 `'2026-11-08'`、`tilesToTry(35.68, 139.76, 14, 60)`・`distanceM(a, b)`・`findPoi(features, 'osm:42')` が両方で `toEqual`
  - `normalizeName は src/shops/domain/merge.ts と同じ答え`: `'ラーメン 一郎 本店'`・`'カフェ「ことり」'`・`'すし処(駅前)'` で3つとも一致
  - `namesMatch`: `('一郎', 'ラーメン一郎 新宿店')` → true、`('一郎', '二郎')` → false、`('', 'x')` → false
- [x] **Step 2:** `npx vitest run supabase/functions` → FAIL
- [x] **Step 3:** 実装。`checkin/index.ts` は `import { UpstreamError, verifyOsm } from './osmTile.ts'` に変えるだけで、流れは1行も変えない。
- [x] **Step 4:** `npx vitest run supabase/functions` → PASS（`checkin/core.test.ts` も含めて）
- [ ] **Step 5:** commit `refactor(functions): move osm tile reading to osmTile.ts`

### Task 4: `daily-hints/core.ts`（入力・抽選・作り直しの距離・ヒントの文）

**Files:**
- Modify: `supabase/functions/daily-hints/core.ts`, `supabase/functions/daily-hints/core.test.ts`

**Interfaces:**
- Produces:
  - 定数（Global Constraints のサーバー側の値）
  - `export type OsmCand = { id: string; lat: number; lng: number }`
  - `export type HintsRequest = { regen: boolean; hp: string[]; osm: OsmCand[] }`
  - `export function parseRequest(body: unknown): HintsRequest | null` — 形が違う・上限超え・id が `^hp:[A-Za-z0-9]{1,32}$` / `^osm:\d+$` でない・lat/lng が有限でない → null。重複 id は1つにする
  - `export function shuffle<T>(xs: readonly T[], random: () => number): T[]`（Fisher–Yates、元を変えない）
  - `export function planDraw(nHp: number, nOsm: number, random: () => number): { hp: number; osm: number }` — `random()` は1回だけ呼ぶ（謎の日の判定）
  - `export function composeDraw(i: { hp: readonly string[]; wantHp: number; osmOk: readonly string[]; wantOsm: number }): string[]` — `hp` は抽選順の hp 全部、`osmOk` はタイルで確かめられた osm（`wantOsm` 件まで）。足りない謎の枠は `hp` の続きで埋める。合計は最大 `HINT_COUNT`
  - `export function centroid(ps: readonly LatLng[]): LatLng`
  - `export function farEnough(prev: readonly LatLng[], next: readonly LatLng[], minM?: number): boolean` — 重心どうしが `minM`（既定 `HINT_REGEN_MIN_M`）以上なら true。どちらかが空なら false
  - `export function catchFragment(catchText: string | null, shopName: string): string | null`（設計 §6.4 の1〜6）
  - `export function budgetShort(budget: string | null): string | null`（設計 §6.4 の表）
  - `export type ShopLite = { shop_id: string; name: string; lat: number; lng: number; genre_name: string | null; catch: string | null; budget_name: string | null }`
  - `export type HintRowIn = { slot: number; shop_id: string; hint_genre: string | null; hint_catch: string | null; hint_budget: string | null; is_mystery: boolean }`
  - `export function hintRow(shop: ShopLite, slot: number, mystery: boolean): HintRowIn` — 謎なら3つとも null
  - `export type HintRowOut = HintRowIn & { hint_id: string; generation: number; completed_checkin_id: string | null }`
  - `export function toResponse(day: string, rows: readonly HintRowOut[], shops: ReadonlyMap<string, { name: string; lat: number; lng: number }>): { hint_date: string; generation: number; regen_left: 0 | 1; hints: unknown[] }` — 設計 §6.2 の形。行が無ければ `generation: 0, regen_left: 0, hints: []`。`regen_left` は generation が 1 なら 1、それ以外 0。`completed` は `completed_checkin_id !== null`。slot 順

- [x] **Step 1: テストを書く**（乱数は `const seq = (...v: number[]) => () => v.shift() ?? 0` で固定）
  - `parseRequest`: 正しい形が通る／`regen` が boolean でない・`hp` が配列でない・`hp:abc-1`（記号）・`osm:12a`・hp 101件・osm 51件・lat が `NaN` → null／余分な項目（`home` など）があっても無視して通るが結果に入らない
  - `planDraw`: `(10,10,0.1)`→`{hp:2,osm:1}`、`(10,10,0.9)`→`{hp:3,osm:0}`、`(1,10,0.9)`→`{hp:1,osm:2}`、`(10,0,0.1)`→`{hp:3,osm:0}`、`(2,0,0.5)`→`{hp:2,osm:0}`、`(0,0,0.1)`→`{hp:0,osm:0}`
  - `composeDraw`: 謎1件が確かめられた→ hp2＋osm1、確かめられなかった（`osmOk: []`）→ hp3、hp も足りなければあるだけ（1件）、重複が無い
  - `shuffle`: 同じ乱数なら同じ順、元の配列は変わらない
  - `farEnough`: 重心が 1500m ちょうど → true、1499m → false、空 → false
  - `catchFragment`: `'【駅徒歩3分】自家製麺の濃厚つけ麺！'`→`'自家製麺の濃厚つけ麺'`、店名「麺屋こころ」で `'麺屋こころの絶品ラーメン♪こだわりスープ'`→`'こだわりスープ'`、`'渋谷駅すぐ！夜景が自慢'`→`'夜景が自慢'`、`'旨い！'`（3文字以下だけ）→ null、15文字以上 → 先頭14文字＋`'…'`、null → null
  - `budgetShort`: `'～500円'`→`'〜1,000円'`、`'501～1000円'`→`'〜1,000円'`、`'1001～1500円'`→`'1,000円台'`、`'5001～7000円'`→`'5,000円台'`、`'10001～15000円'`→`'1万円台'`、`'30001円～'`→`'3万円台'`、`'１，００１〜１，５００円'`（全角）→`'1,000円台'`、`'お問い合わせください'`→ そのまま、null → null
  - `hintRow`: 謎なら genre・catch・budget が null で `is_mystery: true`／hp の店はジャンル名をそのまま・ジャンル無しは null で `is_mystery: false`
  - `toResponse`: generation 1 → `regen_left: 1`、2 → 0、空 → `hints: []`、`shop.name` が付く、slot 順
- [x] **Step 2:** `npx vitest run supabase/functions/daily-hints` → FAIL
- [x] **Step 3:** 実装。`planDraw` の規則: 謎の日 ＝ `random() < HINT_MYSTERY_DAY_RATE && nOsm > 0`。`osm = 謎の日 ? min(HINT_MYSTERY_PER_DAY, nOsm) : 0`、`hp = min(HINT_COUNT - osm, nHp)`、合計が `HINT_COUNT` 未満なら `osm` を `min(nOsm, HINT_COUNT - hp)` まで増やす。`budgetShort` は設計 §6.4 の1〜4（下の端 L を取り、`<1000`・`<10000`・それ以上で分ける）。
- [x] **Step 4:** `npx vitest run supabase/functions` → PASS
- [ ] **Step 5:** commit `feat(daily-hints): draw and hint text core`

### Task 5: `daily-hints/index.ts`（設計 §6.3 の流れ）

**Files:**
- Create: `supabase/functions/daily-hints/index.ts`

**Interfaces:**
- Consumes: Task 3 `verifyOsm`・`UpstreamError`、Task 4 のすべて、Task 2 `create_daily_hints`
- Produces: `POST /functions/v1/daily-hints`。入出力・エラーの形は設計 §6.1・§6.2（409 の `error` は `profile_missing`・`regen_used`・`regen_done`・`no_hints`・`not_far`）

- [x] **Step 1:** 実装。CORS・JWT の確かめ・`json`/`fail` は `checkin/index.ts` と同じ書き方。流れ:
  1. `parseRequest` → null なら 400。`day = jstDay(new Date())`。
  2. 今日の行（`daily_hints` を `user_id`・`hint_date` で、`hint_id, slot, shop_id, generation, hint_genre, hint_catch, hint_budget, is_mystery, completed_checkin_id`）を読み、一番大きい generation の組だけ残す。
  3. `regen = false` で組があれば → 店を付けて `toResponse` で返す（候補は見ない）。
  4. `regen = true`: 組が無い → `no_hints`、generation 2 → `regen_used`、達成あり → `regen_done`（どれも 409）。
  5. 候補の確かめ: `shops` から hp の id の行（`name` が null でないもの）を読む。その人の `checkins` から候補の id（hp と osm 両方）を `in` で読み、あれば外す。作り直しなら、残った候補の位置（hp は `shops` の位置、osm は送られた位置）と今の組の店の位置で `farEnough` → false なら `not_far`（409）。
  6. `shuffle` → `planDraw` → osm を順に `verifyOsm(id, lat, lng)`（**店の位置**で。最大 `HINT_MYSTERY_VERIFY_TRIES` 回。`UpstreamError` はそこで打ち切り）→ 確かめられた osm を `shops` に upsert（`checkin` と同じ列）→ `composeDraw` → `shuffle` して slot 1〜 → `hintRow`。
  7. 0件 → 行を作らず、`regen = false` なら `hints: []`、作り直しなら今の組をそのまま返す。
  8. `db.rpc('create_daily_hints', { p_user, p_day: day, p_regen, p_rows })` → 戻りの行に `shops` の名前・位置を付けて `toResponse`。エラーは `profile_missing`（23503）・P0001 の3つを 409 に、それ以外は 500。
  9. ログは `console.error('daily-hints failed')` だけ。
- [x] **Step 2: 確かめる** Deno が無いので型は通らない前提。次を読み合わせる: ①本文の `home`・`lat`・`lng`（候補の外）を一切読まない ②候補・ユーザー id を `console` に出さない ③`regen = false` で組があるとき `shops`・`checkins`・タイルを読まない ④`npx vitest run supabase/functions` → PASS
- [ ] **Step 3:** commit `feat(daily-hints): edge function`

### Task 6: `checkin` 関数で気配の店を確かめる（設計 §5.3）

**Files:**
- Modify: `supabase/functions/checkin/core.ts`, `supabase/functions/checkin/core.test.ts`, `supabase/functions/checkin/index.ts`

**Interfaces:**
- Consumes: Task 2 の新しい `perform_checkin`、Task 3 の `normalizeName`・`namesMatch`
- Produces:
  - `export type ActiveHintRow = { shop_id: string; generation: number; completed_checkin_id: string | null; shop: { name: string; lat: number; lng: number } | null }`
  - `export function activeHints(rows: readonly ActiveHintRow[]): ActiveHintRow[]` — 一番大きい generation の組の、未達成の行だけ
  - `export function altForMapId(active: readonly ActiveHintRow[], mapId: string | null): boolean` — `mapId` が今の組の未達成の気配か（このときだけタイルで確かめる）
  - `export function altHpFor(active: readonly ActiveHintRow[], poi: { name: string; lat: number; lng: number }): string | null` — `hp:` の気配のうち、`distanceM(poi, shop) <= MATCH_M` かつ `namesMatch(poi.name, shop.name)` の最初の `shop_id`
  - 返事に `was_hint: boolean` を足す。`coins_awarded` は 30 か 40（か 0）

- [x] **Step 1: テストを書く** `checkin/core.test.ts`:
  - `activeHints`: generation 1 と 2 の行があれば 2 だけ、達成済みの行は外れる、空 → 空
  - `altForMapId`: 今の組の未達成の `osm:Y` → true、generation 1（作り直す前）の `osm:Y` → false、null → false
  - `altHpFor`: 30m・同じ名前 → `'hp:X'`、30m・違う名前 → null、45m・同じ名前 → null、`osm:` の気配は対象外 → null
- [x] **Step 2:** `npx vitest run supabase/functions/checkin` → FAIL
- [x] **Step 3:** 実装（`index.ts`）。50m を通ったあと、`perform_checkin` の前に今日の気配（`daily_hints` を `user_id`・`hint_date = day` で、`shop_id, generation, completed_checkin_id, shops(name, lat, lng)`）を読み、`activeHints`。
  - `hp:X` のチェックインで `altForMapId(active, mapId)` → まだタイルで確かめていなければ `verifyOsm(mapId, lat, lng)`。点があり `distanceM(poi, shop) <= MATCH_M` なら `p_alt_shop_id = mapId`。`UpstreamError` は +10 を付けないだけで、チェックインは続ける。
  - `osm:Y` のチェックイン → `p_alt_shop_id = altHpFor(active, osmPoi)`。
  - それ以外は `p_alt_shop_id: null`。`day` は1回だけ計算して `p_day` と共用。返事に `was_hint: row.was_hint`。
- [x] **Step 4:** `npx vitest run supabase/functions` → PASS
- [ ] **Step 5:** commit `feat(checkin): hint bonus with hp/osm id matching`

### Task 7: 端末のチェックインで 40・`wasHint` を受け取り、演出に出す

**Files:**
- Modify: `src/checkin/infra/checkinApi.ts`, `src/checkin/infra/checkinApi.test.ts`, `src/checkin/ui/CheckinEffect.tsx`, `src/checkin/ui/CheckinEffect.test.tsx`, `src/routes/MapPage.tsx`（`effect` の型だけ）

**Interfaces:**
- Produces:
  - `CheckinResult` の成功側: `{ ok: true; checkinId: string; coins: 0 | 30 | 40; wasHint: boolean; newCells: Cell[] }`
  - `CheckinEffect({ coins: 0 | 30 | 40; reveal?: string | null; onDone })` — `reveal` は伏せたままチェックインした店の名前

- [ ] **Step 1: テストを書く**
  - `checkinApi.test.ts`: `coins_awarded 40・was_hint true を受け取る`、`was_hint が無い返事（古い関数）は wasHint false`（Review Focus 1）、`coins_awarded 35 は network`
  - `CheckinEffect.test.tsx`: `40 なら「+40 コイン（気配ボーナス +10）」`、`reveal があれば「『○○亭』だった！」を帯に出す`、`30 は今までどおり`
- [ ] **Step 2:** `npx vitest run src/checkin` → FAIL
- [ ] **Step 3:** 実装。`MapPage` の `effect` の型を `{ coins: 0 | 30 | 40; reveal: string | null; key: number }` にし、今は `reveal: null` を渡す（Task 13 でつなぐ）。
- [ ] **Step 4:** `npx vitest run src/checkin src/routes` → PASS、`npx tsc -b` → 成功
- [ ] **Step 5:** commit `feat(checkin): accept hint bonus (+40) and reveal in effect`

### Task 8: `src/hints/domain`（型・文・候補・明かし・速さと探し直し）

**Files:**
- Create: `src/hints/config.ts`, `src/hints/domain/hint.ts`, `src/hints/domain/candidates.ts`, `src/hints/domain/reveal.ts`, `src/hints/domain/when.ts` と、それぞれの `.test.ts`

**Interfaces:**
- Produces（`hint.ts`）:
  - `export type DailyHint = { id: string; slot: number; shopId: string; genre: string | null; catch: string | null; budget: string | null; isMystery: boolean; completed: boolean; shop: { name: string; lat: number; lng: number } }`
  - `export type HintSet = { day: string; generation: number; regenLeft: 0 | 1; hints: DailyHint[] }`
  - `export const MYSTERY_TEXT = '正体は行ってみてのお楽しみ'`
  - `export function genreLabel(h: DailyHint): string` — 謎 `'謎の気配'`、ジャンルあり `'中華？'`、無し `'ジャンル？'`
  - `export function catchLabel(c: string | null): string | null` — `'…' + c + '…'`。c が `'…'` で終わるときは後ろに足さない
  - `export function budgetLabel(b: string | null): string | null` — `'予算 1,000円台'`
  - `export function hintLines(h: DailyHint): string[]` — 謎は `[MYSTERY_TEXT]`、それ以外は `[genreLabel, catchLabel?, budgetLabel?]`（null は除く）
  - `export function roundDistance(m: number): number` — 100m 未満は 10m 単位、以上は 50m 単位で四捨五入
  - `export function distanceLabel(m: number): string` — `'ここから 約400m'`
  - `export function matchesShop(h: DailyHint, s: Pick<Shop, 'id' | 'mapId' | 'name' | 'lat' | 'lng'>): boolean` — 変えた点4
  - `export function hintPosition(h: DailyHint, shops: readonly Shop[]): LatLng` — `id`/`mapId` が同じ店があればその位置、無ければ `h.shop`
  - `export function guideShops(near: readonly Shop[], checked: ReadonlySet<string>, me: LatLng, count?: number): Shop[]` — 名前あり・未訪問（id と mapId）を近い順に `HINT_NONE_GUIDE_COUNT` 件
- Produces（`candidates.ts`）:
  - `export type Candidates = { hp: string[]; osm: { id: string; lat: number; lng: number }[] }`
  - `export function collectCandidates(i: { shops: readonly Shop[]; cleared: Cleared; checked: ReadonlySet<string>; home: LatLng | null; me: LatLng; regen: boolean; random: () => number }): Candidates` — 設計 §7.1 の 1〜6
- Produces（`reveal.ts`）:
  - `export function updateRevealed(prev: ReadonlySet<string>, hints: readonly DailyHint[], me: LatLng, posOf: (h: DailyHint) => LatLng): { revealed: Set<string>; newly: string[] }` — 30m 以内（`<= HINT_REVEAL_M`）を足す。達成済みは `revealed` に入れるが `newly` には入れない
- Produces（`when.ts`）:
  - `export type Sample = { p: LatLng; t: number }`（t はミリ秒）
  - `export type SpeedGate = { samples: Sample[]; lastFastAt: number | null }`、`export const emptyGate: SpeedGate`
  - `export function pushSample(g: SpeedGate, s: Sample): SpeedGate` — `HINT_SPEED_WINDOW_MS` より古い点を捨て、残りの最初と最後の距離÷時間（幅5秒以上のときだけ）が `HINT_FAST_KMH` を超えたら `lastFastAt = s.t`
  - `export function mayGenerate(g: SpeedGate, now: number): boolean` — `lastFastAt === null || now - lastFastAt >= HINT_SLOW_HOLD_MS`
  - `export function showRegen(set: HintSet | null, me: LatLng | null): boolean` — 組が1件以上・未達成だけ・`regenLeft === 1`・重心から `HINT_REGEN_MIN_M` 以上

- [ ] **Step 1: テストを書く**
  - `hint.test.ts`: `genreLabel` 3通り／`catchLabel('自家製麺')`→`'…自家製麺…'`、`'あいう…'` → `'…あいう…'`／`roundDistance`: 84→80、99→100、120→100、430→450、5→10／`distanceLabel(430)`→`'ここから 約450m'`／`matchesShop`: id 同じ・mapId 同じ → true、`hp:X` の気配と `osm:Y` の店が 20m・`'ラーメン一郎'` と `'一郎'` → true、20m・違う名前 → false、60m・同じ名前 → false（Review Focus 2）／`hintPosition`: mapId で合う店があればその位置、無ければ `h.shop`／`guideShops`: 済み（mapId で済みも）・名前なしを外し近い順に3件
  - `candidates.test.ts`（自宅を原点に、店を東へ m 単位で置く）: 自宅 1km 内にいる → 自宅 1km の店だけ（今いる場所の 1km 外の店は入らない）／自宅の外 → 自宅 1km と今いる場所 1km の両方／`regen: true` → 今いる場所 1km だけ／`home: null` → 今いる場所だけ／晴れたセルの店は外れる／済み（`id`・`mapId`）は外れる／名前が空は外れる／`hp:` は id だけ、`osm:` で `details: null` は id と位置／hp 120件 → 100件、osm 60件 → 50件（乱数固定で毎回同じ）
  - `reveal.test.ts`: 30m ちょうど → 明かす・31m → 明かさない／一度明かした id は離れても残る／達成は `revealed` に入り `newly` に入らない
  - `when.test.ts`: 10秒で 50m（18km/h）→ `mayGenerate` false、そのあと 29秒遅い → false、30秒遅い → true／10秒で 41m（約14.8km/h）→ true／点1つ → true／`showRegen`: 重心から 1500m ちょうど → true、1499m → false、達成あり → false、`regenLeft 0` → false、組が null・空 → false
- [ ] **Step 2:** `npx vitest run src/hints` → FAIL
- [ ] **Step 3:** 実装。距離は `distanceMeters`、晴れは `isClearedAt`、名前の照合は `normalizeName`（merge.ts）。間引きは Fisher–Yates の先頭 N 件。
- [ ] **Step 4:** `npx vitest run src/hints` → PASS、`npm run lint` → 成功
- [ ] **Step 5:** commit `feat(hints): domain (text, candidates, reveal, speed, regen)`

### Task 9: `src/hints/infra`（`hintsApi`・`revealStore`）

**Files:**
- Create: `src/hints/infra/hintsApi.ts`, `src/hints/infra/hintsApi.test.ts`, `src/hints/infra/revealStore.ts`, `src/hints/infra/revealStore.test.ts`

**Interfaces:**
- Produces（`hintsApi.ts`）:
  - `export function parseHintSet(json: unknown): HintSet | null` — 設計 §6.2 の形。1件でも形が違えば null。`hints: []` は空の組（`generation: 0`）として通す
  - `export type HintsError = 'network' | 'no_profile' | 'regen_used' | 'regen_done' | 'no_hints' | 'not_far'`
  - `export async function postDailyHints(input: { regen: boolean; candidates: Candidates }, opts?: { fetchFn?; endpoint?; anonKey?; getToken? }): Promise<{ ok: true; set: HintSet } | { ok: false; reason: HintsError }>` — `postCheckin` と同じ作り（25秒で打ち切り、自動の再送なし）。本文は `{ regen, hp, osm }` だけ
  - `export async function readTodayHints(day: string, client?: HintsClient): Promise<{ ok: true; set: HintSet | null } | { ok: false }>` — `daily_hints` を `hint_date = day` で `hint_id, slot, shop_id, generation, hint_genre, hint_catch, hint_budget, is_mystery, completed_checkin_id, shops(name, lat, lng)` 読み、一番大きい generation の組を slot 順に。行が無ければ `set: null`。`regenLeft` は generation 1 なら 1。client の差し込みは `loadProgress` の `ProgressClient` にならう
- Produces（`revealStore.ts`）:
  - `export function loadRevealed(userId: string, day: string, generation: number): Set<string>` — 保存の day か generation が違えば空
  - `export function saveRevealed(userId: string, v: { day: string; generation: number; ids: string[] }): void`
  - キーは `mogumo.hintsRevealed.<userId>`。読み書きは try/catch（例外は空として扱う）

- [ ] **Step 1: テストを書く**
  - `hintsApi.test.ts`: 200 の正しい形 → `ok` と `HintSet`／`hints` の1件が `slot` 無し → network／409 の `regen_used`・`regen_done`・`not_far`・`no_hints`・`profile_missing`（→ `no_profile`）を読み分ける／500・fetch の例外・トークン無し → network／本文に `regen`・`hp`・`osm` 以外の項目が無い／`readTodayHints`: generation 1 と 2 の行 → 2 の組だけ・`regenLeft 0`、行なし → `set: null`、エラー（列が無いなど）→ `ok: false`（Review Focus 1）
  - `revealStore.test.ts`: 保存して同じ day・generation で読むと戻る／day が違えば空／generation が違えば空／壊れた JSON は空／`localStorage` が例外を投げても落ちない
- [ ] **Step 2:** `npx vitest run src/hints/infra` → FAIL
- [ ] **Step 3:** 実装
- [ ] **Step 4:** `npx vitest run src/hints` → PASS
- [ ] **Step 5:** commit `feat(hints): api and reveal store`

### Task 10: 地図のつなぎ（`worldLayers`・`hintPins`・`MapView`）

**Files:**
- Create: `src/hints/infra/hintPins.ts`, `src/hints/infra/hintPins.test.ts`, `src/hints/ui/hints.css`（ピンの見た目）
- Modify: `src/map/ui/worldLayers.ts`, `src/map/ui/worldLayers.test.ts`, `src/map/ui/MapView.tsx`

**Interfaces:**
- Consumes: Task 8 `DailyHint`
- Produces:
  - `createHintPins(map: MapLibreMap, onTap: (hintId: string) => void): { update(hints: readonly DailyHint[], positions: ReadonlyMap<string, LatLng>, revealed: ReadonlySet<string>): void; bounce(hintId: string): void; dispose(): void }` — 達成済みは出さない。仮の見た目: 白い丸＋水色の「？」＋ぼかした影、謎は薄い紫、明かし済みは別のクラス。ピンを押したとき地図のタップに伝えない（`stopPropagation`。`buildingPins` にならう）。`bounce` は CSS で約0.4秒
  - `World` に `hintInputs(): { shops: Shop[]; near: Shop[]; cleared: Cleared; checked: ReadonlySet<string> }`（`shops` は合体済みの全部、`near` は `shopsNear()`、`checked` は `checkedNow()`）と `shopsReady(): boolean`。`Deps` に `onShopsReady?: () => void`（ホットペッパーの1回成功（使えない環境では不要）・地図のお店の取り出し・`loadProgress` の3つがそろった最初の1回だけ呼ぶ）
  - `MapViewHandle` に `hintInputs(): ReturnType<World['hintInputs']> | null`・`whenShopsReady(): Promise<void>`・`setHints(hints: readonly DailyHint[], positions: ReadonlyMap<string, LatLng>, revealed: ReadonlySet<string>): void`・`focusAt(p: LatLng): void`（タップでお店に寄せるのと同じカメラ移動。戻すのは今の `unfocus`）・`bounceHint(hintId: string): void`
  - `MapView` の props に `onHintTap: (hintId: string) => void`

- [ ] **Step 1: テストを書く**
  - `hintPins.test.ts`（MapLibre の `Marker` はモック。`buildingPins.test.ts` にならう）: 3件で3つ作る／達成済みは作らない／同じ内容で `update` しても作り直さない／別の組で `update` すると古いマーカーを全部 `remove`（Review Focus 5）／押すと `onTap(id)`／`dispose` で全部消える
  - `worldLayers.test.ts`: `hintInputs()` が合体済みの店と済みの id を返す／3つそろうまで `onShopsReady` を呼ばない・そろったら1回だけ（`shopsEnabled: false` ならホットペッパーを待たない）
- [ ] **Step 2:** `npx vitest run src/hints src/map` → FAIL
- [ ] **Step 3:** 実装。ピンの高さはビルのピンと重ならないよう少し上（値は作る人が決める）。
- [ ] **Step 4:** `npx vitest run src/hints src/map` → PASS、`npx tsc -b` → 成功
- [ ] **Step 5:** commit `feat(map): hint pins and hint inputs`

### Task 11: `useDailyHints`（流れのまとめ）

**Files:**
- Create: `src/hints/ui/useDailyHints.ts`, `src/hints/ui/useDailyHints.test.tsx`

**Interfaces:**
- Consumes: Task 8・9・10
- Produces:
  - `export type ExploreStatus = 'idle' | 'loading' | 'fast' | 'unavailable' | 'timeout' | 'error' | 'ready'`（`ready` で `set.hints` が空なら気配なし）
  - `export function useDailyHints(a: { userId: string; enabled: boolean; me: LatLng | null; home: LatLng | null; map: RefObject<MapViewHandle | null>; api?: { readTodayHints; postDailyHints } }): { status: ExploreStatus; set: HintSet | null; revealed: ReadonlySet<string>; positions: ReadonlyMap<string, LatLng>; newlyRevealed: DailyHint | null; regenVisible: boolean; fast: boolean; notice: string | null; openSheet(): void; closeSheet(): void; retry(): void; regen(): void; hintFor(shop: Shop): DailyHint | null; isMasked(shop: Shop): boolean; markCompleted(shop: Shop): void; clearNewly(): void }`
  - `enabled` は `shopSourceEnabled(...)` の結果

- [ ] **Step 1: テストを書く**（`renderHook`。api はモック、`map` は偽の handle、時刻は `vi.useFakeTimers`）
  - `開いただけでは postDailyHints を呼ばない（読むだけ）`、`今日の組があればピンを出す（setHints）`
  - `openSheet で組が無ければ、そろうのを待って候補を送る`／`2回目の openSheet は読み直すだけで送らない`
  - `enabled false → unavailable で送らない`／`whenShopsReady が 30 秒で来なければ timeout`
  - `速い（10秒で 50m）間は fast で送らず、遅いまま 30 秒続くと送る`（`me` の変化を時刻つきで与える）
  - `送信の失敗は error、retry で1回だけやり直す`
  - `0件なら ready で hints 空、次の openSheet でまた送る`
  - `regen: 409 regen_used / regen_done / not_far でボタンが消え、読み直す`／`作り直しで0件なら notice「この辺りには気配がありませんでした」で組はそのまま`／`作り直したら古い組のピンを消し、明かした記録を捨てる`（Review Focus 5）
  - `30m に入ると newlyRevealed と bounceHint、revealStore に保存`／`markCompleted で達成になり regenVisible が false`
  - `日付が変わったら（1分ごとと visibilitychange）組・明かしを消す`／`読んだ組の day が今日でなければ捨てる`（Review Focus 4）
  - `isMasked`: 未明かし・未達成の気配の店 → true、明かした・達成 → false、気配でない店 → false
- [ ] **Step 2:** `npx vitest run src/hints/ui` → FAIL
- [ ] **Step 3:** 実装。state は `useReducer` でも `useState` でもよい。候補は `collectCandidates({ ...map.hintInputs(), home, me, regen, random: Math.random })`。`positions` は `hintPosition(h, hintInputs().shops)` を `me` が変わるたびに出し直す（3件なので軽い）。返ってきた `hint_date` を `day` の正本にする。
- [ ] **Step 4:** `npx vitest run src/hints` → PASS
- [ ] **Step 5:** commit `feat(hints): useDailyHints flow`

### Task 12: 画面（探索ボタン・探索シート・ヒントのシート・明かしの帯）と `MapPage` のつなぎ

**Files:**
- Create: `src/hints/ui/ExploreButton.tsx`, `src/hints/ui/ExploreSheet.tsx`, `src/hints/ui/HintSheet.tsx`, `src/hints/ui/RevealBanner.tsx` と、それぞれの `.test.tsx`
- Modify: `src/hints/ui/hints.css`, `src/routes/MapPage.tsx`, `src/routes/MapPage.test.tsx`

**Interfaces:**
- Consumes: Task 8 の文の関数、Task 11 の戻り値
- Produces:
  - `ExploreButton({ remaining: number | null; onClick })` — `remaining` が null なら数字なし
  - `ExploreSheet({ status; set; revealed; distances: ReadonlyMap<string, number>; regenVisible; fast: boolean; notice; guide: { shop: Shop; distanceM: number }[]; onPickHint(id); onPickShop(shop); onRegen; onRetry; onClose })`
  - `HintSheet({ hint: DailyHint; distanceM: number | null; onClose })`
  - `RevealBanner({ name: string; onDone })` — `REVEAL_BANNER_MS` で閉じる。文「気配の正体は…『○○亭』！」

- [ ] **Step 1: テストを書く**
  - `ExploreSheet.test.tsx`: 状態ごとの文（loading・fast・unavailable・timeout・error＋「もう一度」）／3件で「中華？」「…自家製麺の濃厚つけ麺…」「予算 1,000円台」「ここから 約400m」が出て**店名が出ない**／謎の気配の文／達成は店名と「達成 +10」／明かした気配は店名／探し直すボタンは `regenVisible` のときだけ、`fast` なら押せず「降りてから探し直してね」／気配なしで「今日は気配なし」と案内3件・案内が無ければ「近くにまだ行っていないお店はありません」／「Powered by ホットペッパーグルメ Webサービス」が出る
  - `HintSheet.test.tsx`: 「？？？」と距離とヒントの行、「近づくと正体が分かるよ（30m）」、店名が出ない、クレジットが出る
  - `ExploreButton.test.tsx`: 「探索」、`remaining 2` で「2」、null で数字なし
  - `RevealBanner.test.tsx`: 店名入りの文、3秒で `onDone`
  - `MapPage.test.tsx`: 探索ボタンでシートが開く／気配を押すと `focusAt` とヒントのシート／明かした気配を押すとお店のシート／シートを閉じると `unfocus`
- [ ] **Step 2:** `npx vitest run src/hints/ui src/routes` → FAIL
- [ ] **Step 3:** 実装。`MapPage` の state に「開いているシート」（探索／ヒント／お店／ビル。同時に1つ）を持つ。`MapView` の `onHintTap` と探索シートの `onPickHint` は同じ処理: 明かし済み・達成 → `hintInputs().shops` から `matchesShop` の店を探してお店のシート（見つからなければヒントのシート）、それ以外 → `focusAt(位置)`＋ヒントのシート。探索ボタンは地図の下の真ん中で、ホットペッパーのクレジットと重ならない位置（見た目は作る人が決める、ビルのピンとそろえる）。
- [ ] **Step 4:** `npm test` → PASS、`npx tsc -b` → 成功、`npm run lint` → 成功
- [ ] **Step 5:** commit `feat(hints): explore button, sheets and reveal banner`

### Task 13: 他のシートで店名を伏せる・「気配の店 +10」の札・伏せたままのチェックイン

**Files:**
- Modify: `src/checkin/ui/ShopSheet.tsx`, `src/checkin/ui/ShopSheet.test.tsx`, `src/checkin/ui/BuildingSheet.tsx`, `src/checkin/ui/BuildingSheet.test.tsx`, `src/routes/MapPage.tsx`, `src/routes/MapPage.test.tsx`

**Interfaces:**
- Consumes: Task 11 `hintFor`・`isMasked`・`markCompleted`、Task 7 `CheckinEffect` の `reveal`
- Produces:
  - `ShopSheet` の props に `hint?: DailyHint | null`・`masked?: boolean`。`masked` なら名前は「？？？」、営業時間の代わりに `hintLines(hint)`。`hint` が未達成なら「気配の店 +10」の札
  - `BuildingSheet` の props に `maskedIds?: ReadonlySet<string>`（その店の行は「？？？」）・`hintIds?: ReadonlySet<string>`（札）

- [ ] **Step 1: テストを書く**
  - `ShopSheet.test.tsx`: `masked で店名と営業時間が出ず「？？？」とヒントの行`、`未達成の気配の店に「気配の店 +10」`、`masked でもチェックインのボタンは押せる`
  - `BuildingSheet.test.tsx`: `maskedIds の店は「？？？」、他の店は名前`、`並び順で伏せた店の名前が推測できないよう「？？？」は最後に並ぶ`
  - `MapPage.test.tsx`: `伏せた店でチェックインが成功（wasHint true）→ 演出の帯に正体、markCompleted が呼ばれる`／`失敗（too_far）なら正体を出さない`（Review Focus 3）／`wasHint true の返事で探索シートの気配が達成になる`
- [ ] **Step 2:** `npx vitest run src/checkin src/routes` → FAIL
- [ ] **Step 3:** 実装。`MapPage` はお店のシート・ビルの一覧を開くときに `hintFor`・`isMasked` で渡す。チェックインの成功時、`masked` だったら `effect.reveal = shop.name`、`wasHint` なら `markCompleted(shop)`。
- [ ] **Step 4:** `npm test` → PASS、`npx tsc -b`・`npm run lint` → 成功
- [ ] **Step 5:** commit `feat(checkin): mask hint shop names until revealed`

### Task 14: 明かしの演出と全体の確認

**Files:**
- Modify: `src/routes/MapPage.tsx`, `src/hints/ui/hints.css`

- [ ] **Step 1:** `newlyRevealed` が来たら `RevealBanner` を出し（`clearNewly` で閉じる）、ピンの `bounce` は Task 11 で呼ばれていることを確かめる。`MapPage.test.tsx` に `30m で帯「気配の正体は…『○○亭』！」が出る` を足して FAIL → 実装 → PASS。
- [ ] **Step 2:** `npm test`・`npx tsc -b`・`npm run lint`・`npm run build` → すべて成功
- [ ] **Step 3:** `npm run dev` の `?fake` で、探索ボタン・シート・ピン（雲の上に見える）・ヒントのシートを撮る（`daily-hints` がまだ無いので「気配を読み込めませんでした」になるのが正しい。その画面も撮る）。PNG で本人に送るのはリーダー。
- [ ] **Step 4:** commit `feat(hints): reveal banner`

### Task 15（リーダー）: シロへの素材の依頼

- [ ] `handoff/to-shiro/2026-11-07-hint-reveal-art.md` を書く（`状態: 未対応`。中身は設計 §12 の「ぽふっ」: 透明背景の PNG 連番 8コマ（または横並び1枚）、1コマ 256×256px、約0.6〜1秒、霧の見本 `art/reference/fog-and-shops-reference.webp` に合わせた白い頭と水色の影のもくもく・水彩風、キラキラなし、用途は 30m で店名が明かされる瞬間にピンの位置へ重ねる）。`handoff/LOG.md` に1行。すぐ dev へ push（メモリの決まり）。
- [ ] 届いたら、`RevealBanner` の前に重ねる小さな Task を別に足す（この計画の範囲外）。

### Task 16（リーダーとオーナー）: 開発用 `mogumo-go-dev` への反映（設計 §13 の手順15の順）

本番の Supabase には何も流さない。毎回、画面のプロジェクト名が `mogumo-go-dev` であることを確かめる。手順書は `docs/superpowers/plans/2026-11-06-hotpepper-checkin-deploy.md` の書き方にそろえ、リーダーがオーナー用に `docs/superpowers/plans/2026-11-07-daily-hints-deploy.md` を作る。

- [ ] **1. アプリを dev へ**（リーダー）: このブランチを `dev` に入れて push（`session-handoff.md` の手順）。`mogumo-go-dev.vercel.app` で、チェックインが今までどおり +30 で通り、探索シートが「気配を読み込めませんでした」になることを確かめる（Review Focus 1）。
- [ ] **2. SQL 0004**（オーナー）: SQL Editor に `0004_daily_hints.sql` を貼って Run。続けてすぐ 3 へ（2 と 3 の間はチェックインが失敗する。その間はチェックインを試さない）。
- [ ] **3. 関数 `checkin` を置き直す**（オーナー）: `index.ts`・`core.ts` に加えて、**新しく `osmTile.ts` を足す**。Verify JWT はオン。
- [ ] **4. 関数 `daily-hints` を新しく置く**（オーナー）: 名前を先に `daily-hints` に変える。`index.ts`・`core.ts`・`osmTile.ts` の3つ。Verify JWT はオン。Secrets は追加しない。もしエディターでフォルダ違いの import が使えると分かっても、この計画の形（同じフォルダ）のまま置く。
- [ ] **5. SQL の手での確かめ**（リーダーが SQL を用意し、オーナーが SQL Editor で流す）: 0004 の先頭のコメントの確かめ方。
- [ ] **6. iPhone で確かめる**（オーナー）: 設計 §13 の手順17 の一覧（開いただけでは作られない／シートで3件／開き直しても同じ／電車の中で「降りたら…」／1.5km 移動で「この辺りで探し直す」が1回だけ／30m で明かし／地図の文字で店名が見えない／気配の店で +40／30〜50m で演出に正体／翌日に入れかわる／気配なしの表示）。

### Task 17（リーダー）: 書き物

- [ ] `docs/basic-design.md` の表（234行付近）に「気配ピンは3つだけなので HTML マーカー（2026-11-07）」、`docs/detailed-design-db.md` 3.10 に `generation` と D-17 に「生成は探索シートを開いたとき・0004 で実装」、`docs/SPEC.md` §9 の気配の行に 2026-11-07 の決定（作る時の工夫 a〜c）を追記。
- [ ] 設計 §6.3 の `_shared/osmTile.ts` に「→ 各関数のフォルダに同じ `osmTile.ts`（ダッシュボードで置くため。計画 2026-11-07-daily-hints の変えた点1）」と追記。
- [ ] `CLAUDE.md` の現状（`src/hints/`・`daily-hints`・0004）、`docs/session-handoff.md`、`docs/learning-log.md` を更新。
- [ ] commit `docs: daily hints done`
