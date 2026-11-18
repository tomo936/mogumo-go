# ホットペッパー連携とチェックイン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real shops (map-tile POIs as the base, HotPepper details on top). Let the player tap a shop within 50 m and check in. A check-in records a card, gives 30 coins (once per shop per day) and clears 200 m of fog, with a confetti, banner and fog-wave effect.

**Architecture:**
- **Shops.** The client reads food POIs from the OpenFreeMap tiles it already loads. It fetches HotPepper shops through the Edge Function `shops-hotpepper`, then merges the two lists in a pure domain function.
- **Check-in.** It goes through the Edge Function `checkin`. The function verifies the 50 m distance; for `osm:` shops it also verifies the POI in the tile itself. It then calls one SQL function that writes `checkins`, `coin_ledger` and `fog_cells` in a single transaction.
- **Fog.** The client loads its own `fog_cells`, merges them with the home 200 m, and animates newly cleared cells as a wave. The wave reuses the spike `.superpowers/preview/spike/fogLayerSpike.ts`.

**Tech Stack:**
- Client: React 19, TypeScript 7, MapLibre 6.16, three 0.170, Vitest
- Edge Functions: Supabase (Deno), using `npm:@supabase/supabase-js@2` and `npm:@mapbox/vector-tile` / `npm:pbf` inside the functions

**Spec:** `docs/superpowers/specs/2026-11-06-hotpepper-checkin-design.md` (§12 of `2026-11-06-fog-and-shops-design.md` for the fog layer)

## Global Constraints
- **Branch:** work on a new branch `cycle1-checkin`, created from `cycle1-fog-shops`. `main` is not touched.
- **Toolchain:**
  - Use `import type` for type-only imports.
  - No `enum`, `namespace` or parameter properties.
  - Imports carry their `.ts` / `.tsx` extension.
  - No unused locals or params.
- **Clean architecture:**
  - `domain/` imports nothing from React, MapLibre, Supabase or the browser.
  - `config.ts` files import nothing.
  - Dependency direction is ui → infra → domain.
- **Secrets:**
  - `HOTPEPPER_API_KEY` is read only inside Edge Functions (`Deno.env.get`). It never appears in client code, responses, logs or URLs that are returned.
  - The service-role key is used only inside Edge Functions.
- **Privacy:**
  - Never send home coordinates.
  - The shop search sends a centre rounded to a 250 m grid (`roundCenter`, same formula as now).
  - The check-in sends the exact current position, but the server never stores or logs it, or the distance.
  - Edge Functions log no coordinates.
- **Values (verbatim from spec):**
  - check-in distance 50 m
  - clear radius 200 m
  - coins 30, once per shop per day (day boundary JST 0:00)
  - shop radius 1 km
  - in-fog visibility 50 m
  - match distance 40 m
  - wave about 1 s
  - whole effect about 3 s, skippable by tap
- **IDs:** shops are `osm:<tile feature id>` or `hp:<HotPepper id>`. A merged shop keeps the `hp:` id and the map point's position.
- **Grid:** the fog cell formula is unchanged: `dLat = 25/111195`, `dLng = 25/(111195·cos35°)`, cell = `floor`. Cells in the 200 m circle are those whose centre is inside it, the same as `cellsInCircle`.
- **HotPepper credit:**
  - Always show the text link "Powered by ホットペッパーグルメ Webサービス" to `http://webservice.recruit.co.jp/`, unaltered.
  - Images are not shown this step.
- **Commit messages:** English, ending with the two attribution lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Bp5TxDpu6Cd1eUVq3yDMuP
  ```
- **Push:** `git push` runs as a single standalone command.

## Review Focus
1. **Double tap or a slow network on 「チェックイン」.** Expect one request in flight, the button disabled until the reply, and at most one coin per shop per day even if two requests land. Pinned in Task 6 (SQL unique index plus RPC) and Task 10 (button state).
2. **A check-in at an already-cleared shop.** Expect `new_cells` to be empty: no wave, but the banner still shows and coins are given if it is the first time today. Pinned in Task 6 and Task 11.
3. **A position exactly at the 50 m boundary, or GPS drift while the sheet is open.** Expect the button to follow the live distance, and the server to be the judge, with a "too far" message shown. Pinned in Task 6 (49.9/50.1 m) and Task 10 (live distance prop).
4. **The same shop under two names, or two different shops 30 m apart with similar names.** Expect only true matches to merge (branch names, spaces, kana differences), and no merge between different shops. Pinned in Task 2.
5. **Reopening the app after a check-in.** Expect the cleared cells and check marks to still be there, loaded from the server. Pinned in Task 7 (load progress) and Task 9 (cleared merges server cells).

---

### Task 1: Shop model and the 13 kinds from both sources

**Files:**
- Modify: `src/shops/domain/shop.ts`
- Create: `src/shops/domain/kind.ts`, `src/shops/domain/kind.test.ts`

**Interfaces:**
- Produces:
  - `type ShopDetails = { genreCode: string | null; genreName: string | null; catch: string | null; budgetName: string | null; open: string | null }`
  - `type Shop = { id: string; name: string; lat: number; lng: number; kind: ShopKind; details: ShopDetails | null }`. `details` is null for map-only shops.
  - `kindFromHotpepper(genreCode: string | null, name: string): ShopKind`
  - `kindFromMap(subclass: string, name: string): ShopKind`

- [ ] **Step 0: Create the branch.** Run `git switch -c cycle1-checkin` from `cycle1-fog-shops`.
- [ ] **Step 1: Write table tests** in `kind.test.ts`. Use the spec §4.5 order; HotPepper codes are verified in Step 3.

  `kindFromHotpepper`:
  - `('G013','x')` → ramen
  - `('G004','鮨 さかな')` → sushi (G004 = 和食)
  - `('G004','手打ち蕎麦')` → soba
  - `('G004','うどん屋')` → soba
  - `(null,'カレーの店')` → curry
  - `('G008','x')` → yakiniku
  - `('G017','x')` → yakiniku
  - `('G007','x')` → chinese
  - `('G005','x')` → western
  - `('G006','x')` → western
  - `('G004','割烹')` → washoku
  - `('G001','x')` → izakaya
  - `('G002','x')` → izakaya
  - `('G014','ケーキ工房')` → cake
  - `('G014','スイーツ')` → cake
  - `('G014','珈琲館')` → cafe
  - `('G014','x')` → cafe (builder rule: G014 without words is cafe)
  - `(null,'ベーカリー')` → bakery
  - `(null,'パン工房')` → bakery
  - `('G010','x')` → mystery

  `kindFromMap`:
  - `('bakery','x')` → bakery
  - `('confectionery','x')` → cake
  - `('ice_cream','x')` → cake
  - `('cafe','x')` → cafe
  - `('bar','x')` → izakaya
  - `('pub','x')` → izakaya
  - `('restaurant','ラーメン太郎')` → ramen
  - `('restaurant','鮨 さかな')` → sushi
  - `('fast_food','カレーハウス')` → curry
  - `('restaurant','x')` → mystery
- [ ] **Step 2: Run** `npx vitest run src/shops/domain/kind.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
  - Before coding, confirm the genre codes against the real master. The HotPepper genre master API is `https://webservice.recruit.co.jp/hotpepper/genre/v1/?key=…&format=json`.
    - The builder has no key. Run this check after Task 4's function is deployed by temporarily logging the genre list, or by asking the owner.
    - Until then use the codes above and leave a `// 要確認: ジャンルマスタ` comment beside the code table.
  - Name words:
    - ramen: ラーメン, らーめん, 拉麺, 中華そば
    - sushi: 寿司, 鮨, すし
    - soba: そば, 蕎麦, うどん
    - curry: カレー
    - cake: ケーキ, スイーツ
    - cafe: カフェ, 珈琲, コーヒー
    - bakery: パン, ベーカリー, ブーランジェリー
  - Name rules (ramen, sushi, soba, curry) are checked for map shops before the subclass default.
- [ ] **Step 4: Run** `npx vitest run src/shops/domain/kind.test.ts`. Expected: PASS. Then `npx tsc -b` (type errors in callers of `Shop` are fixed by adding `details: null` in existing fixtures and parsers).
- [ ] **Step 5: Commit** `feat(shops): 13 kinds from HotPepper genres and map POI classes`.

### Task 2: Merge map shops with HotPepper shops

**Files:**
- Create: `src/shops/domain/merge.ts`, `src/shops/domain/merge.test.ts`
- Modify: `src/shops/config.ts` (add `MATCH_DISTANCE_M = 40`)

**Interfaces:**
- Consumes: `Shop` (Task 1), `distanceMeters` (`src/map/domain/geo.ts`)
- Produces:
  - `normalizeName(name: string): string`
  - `mergeShops(mapShops: Shop[], hpShops: Shop[]): Shop[]`. For a matched pair the result is `{ ...hp, lat: map.lat, lng: map.lng }`. Unmatched shops from both lists are kept. Each map shop matches at most one HotPepper shop: the nearest one that qualifies.

- [ ] **Step 1: Write tests.**
  - `normalizeName`:
    - `normalizeName('カフェ・もぐも（新宿店）') === normalizeName('かふぇ もぐも')`
    - `normalizeName('ＭＯＧＵ Cafe') === normalizeName('mogu cafe')`
    - Rules: hiragana→katakana; remove spaces, `・`, `-`, and full- or half-width brackets with their content; remove a trailing `店`/`本店`/`支店`; lowercase ASCII; NFKC.
  - Merge cases:
    - same name 20 m apart → merged; id is `hp:`, position is the map point's
    - same name 45 m apart → not merged
    - `'もぐも'` vs `'もぐも 新宿店'` 10 m apart → merged (containment)
    - `'すし太郎'` vs `'そば太郎'` 10 m apart → not merged
    - two HotPepper shops near one map shop → only the nearest qualifying one merges; the other stays as its own shop
    - an empty list on either side works
- [ ] **Step 2: Run** `npx vitest run src/shops/domain/merge.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Match when `distanceMeters <= MATCH_DISTANCE_M`, both normalized names are non-empty, and one contains the other.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shops): merge map POIs with HotPepper shops by distance and name`.

### Task 3: Food POIs from the map tiles

**Files:**
- Create: `src/shops/infra/mapShops.ts`, `src/shops/infra/mapShops.test.ts`

**Interfaces:**
- Consumes: `FeatureSource` (`src/shops/infra/mapFeatures.ts`, which already matches `map.querySourceFeatures`), `kindFromMap` (Task 1), `distanceMeters`
- Produces: `extractMapShops(src: FeatureSource, center: LatLng, radiusM: number): Shop[]`
  - Read source `openmaptiles`, layer `poi`.
  - Keep `subclass` in `restaurant, cafe, fast_food, bar, pub, bakery, confectionery, ice_cream`, a non-empty `name`, and a Point geometry.
  - id is `osm:${feature.id}`.
  - Dedupe by id: tiles overlap, so the same POI comes more than once; keep the first.
  - Keep only shops within `radiusM`.
  - `details` is null.
- `FeatureSource`'s feature type gets an optional `id?: number | string`.

- [ ] **Step 1: Write tests** with a fake source:
  - a restaurant POI 100 m away is returned with `osm:` id and kind from name
  - a `parking` POI is ignored
  - a nameless POI is ignored
  - the same id twice gives one shop
  - 1200 m away is excluded at radius 1000
  - a feature without `id` is skipped
- [ ] **Step 2: Run** `npx vitest run src/shops/infra/mapShops.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** it.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shops): read food POIs from the map tiles`.

### Task 4: `shops-hotpepper` Edge Function and client fetch; remove Overpass

**Files:**
- Create:
  - `supabase/functions/shops-hotpepper/core.ts` (pure)
  - `supabase/functions/shops-hotpepper/core.test.ts`
  - `supabase/functions/shops-hotpepper/index.ts` (Deno server)
- Create: `src/shops/infra/hotpepper.ts`, `src/shops/infra/hotpepper.test.ts` (from the existing `overpass.ts` / `overpass.test.ts`, keeping the retry and token logic)
- Modify:
  - `vite.config.ts`: test `include` adds `'supabase/functions/**/*.test.ts'`
  - `src/shops/config.ts`: rename `OVERPASS_CENTER_GRID_M` → `SHOP_CENTER_GRID_M` (250) and `OVERPASS_RETRY_WAIT_MS` → `SHOP_RETRY_WAIT_MS` (3000)
- Delete:
  - `src/shops/infra/overpass.ts`, `overpass.test.ts`, `__fixtures__/` (if it holds only Overpass data)
  - `src/shops/domain/genre.ts`, `genre.test.ts`
  - `supabase/functions/shops-overpass/`
- Migration column `shops.open` is in Task 6. This function upserts `open` only after Task 6 lands, so write the upsert with `open` from the start and note the order in the deploy notes (Task 12).

**Interfaces:**
- `core.ts` exports (no Deno or npm imports, so Vitest can import it):
  - `roundCenter(lat: number, lng: number): { lat: number; lng: number }`. 250 m grid, the same formula as the client.
  - `hotpepperUrl(key: string, lat: number, lng: number, start: number): string`. Params: `lat`, `lng`, `range=3`, `count=100`, `start`, `format=json`.
  - `parseHotpepper(json: unknown): ShopRow[]`. Drops nameless shops.
  - `type ShopRow = { shop_id: string; name: string; lat: number; lng: number; genre_code: string | null; genre_name: string | null; catch: string | null; budget_code: string | null; budget_name: string | null; photo_url: string | null; open: string | null }`. `shop_id` is `hp:<id>`; `photo_url` is `photo.mobile.l`.
- `index.ts`:
  - POST `{lat, lng}` → rounds → fetches up to 3 pages (stop when fewer than 100 come back) → upserts `shops` with the service-role client (`fetched_at = now()`) → returns `ShopRow[]` as JSON.
  - Same CORS / 400 / 429 / 502 rules as `shops-overpass`.
  - Logs nothing with coordinates or the key.
- Client `hotpepper.ts`:
  - `fetchHotpepperShops(center: LatLng, opts?): Promise<Shop[]>`. Same options and retry as the old `fetchShops`; endpoint `/functions/v1/shops-hotpepper`. Maps rows to `Shop` with `kind = kindFromHotpepper(genre_code, name)` and `details` filled.
  - `roundCenter` and `shopSourceEnabled` move here unchanged.

- [ ] **Step 1: Write `core.test.ts`.**
  - `roundCenter(35.6909, 139.7003)` equals the client `roundCenter` from `src/shops/infra/hotpepper.ts` for 5 sample points (import both).
  - `hotpepperUrl` contains `range=3`, `count=100`, `format=json`, `start=101`.
  - `parseHotpepper` on a 2-shop fixture (one nameless) returns 1 row, with `hp:` id and `open` copied.
  - Bad JSON returns `[]`.
- [ ] **Step 2: Write `hotpepper.test.ts`** by porting `overpass.test.ts`: no token means no fetch; retry once on 429/5xx; body is the rounded centre; the endpoint name.
- [ ] **Step 3: Run both tests.** Expected: FAIL.
- [ ] **Step 4: Implement** `core.ts`, `index.ts` and `hotpepper.ts`, and delete the Overpass files.
  - `index.ts` uses the Deno globals (`Deno.serve`, `Deno.env.get`) directly. `tsc -b` does not include `supabase/`, and Vitest only imports `core.ts`, so no extra typing is needed.
  - Import supabase-js with `import { createClient } from 'npm:@supabase/supabase-js@2'`.
- [ ] **Step 5: Run** `npm test && npx tsc -b && npm run lint`. Expected: all pass. No reference to `overpass` remains (`git grep -n -i overpass -- src supabase` prints nothing).
- [ ] **Step 6: Commit** `feat(shops): HotPepper Edge Function and client; remove Overpass`.

### Task 5: World layer shows merged shops, in-fog shops within 50 m

**Files:**
- Modify:
  - `src/shops/domain/visibility.ts` (+ test)
  - `src/map/ui/worldLayers.ts` (+ test)
  - `src/map/ui/MapView.tsx`
  - `src/shops/config.ts` (add `IN_FOG_VISIBLE_M = 50`)

**Interfaces:**
- `visibleShops(shops, me, cleared)` keeps its signature. New rule: within 1 km AND (in a cleared cell OR within `IN_FOG_VISIBLE_M`). Nearest first, max 40.
- `attachWorld` deps:
  - `fetchShops` is replaced by `fetchHotpepper: (center: LatLng) => Promise<Shop[]>`.
  - On each shop refresh: `mapShops = extractMapShops(map, p, SHOP_RADIUS_M)` (only when `map.areTilesLoaded()`; cached until the next refresh), then `shops = mergeShops(mapShops, hpShops)`.
- `attachWorld` returns, in addition:
  - `shopsNear(): Shop[]`, the shops currently shown (used by tap picking in Task 10)

- [ ] **Step 1: Tests.**
  - visibility: an in-fog shop at 40 m is shown, an in-fog shop at 60 m is not, a cleared shop at 900 m is shown.
  - worldLayers: with tiles holding one POI and HotPepper returning the same shop 10 m away with the same name, `setShops` gets one shop with an `hp:` id. With HotPepper failing, map shops still show and `onShopsError` is called once.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Map shops do not depend on the network, so `shopsEnabled: false` (production) still shows map shops and skips only HotPepper.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shops): show map shops merged with HotPepper; in-fog shops within 50 m`.

### Task 6: Migration 0002 and the `checkin` Edge Function

**Files:**
- Create: `supabase/migrations/0002_checkin.sql`
- Create:
  - `supabase/functions/checkin/core.ts` (pure)
  - `supabase/functions/checkin/core.test.ts`
  - `supabase/functions/checkin/index.ts`

**Interfaces:**
- SQL:
  - `alter table public.shops add column open text null;`
  - `public.perform_checkin(p_user uuid, p_shop_id text, p_far boolean, p_day date, p_cells int[][]) returns table(checkin_id uuid, coins_awarded int, new_cells int[][])`
    - `security definer`, `set search_path = public`
    - Grant `execute` only to `service_role`, and revoke it from public, anon and authenticated.
    - Steps, in one statement block:
      1. Insert the checkin with `reward_day = p_day`. If the partial unique index conflicts, insert with `reward_day = null` (use `insert … on conflict do nothing` on the partial index and check `found`).
      2. If `reward_day` was set, insert `coin_ledger('checkin', 30, checkin_id)`.
      3. Insert cells with `on conflict do nothing returning cell_x, cell_y`, and return those as `new_cells`.
  - Requires the `profiles` row (FK). A missing row raises → the function returns 409.
- `core.ts` exports (no Deno or npm imports):
  - `distanceM(a, b): number` (haversine, the same as `distanceMeters`)
  - `CHECKIN_M = 50`, `CLEAR_M = 200`
  - `cellsAround(lat, lng, radiusM): [number, number][]`. Same cells as client `cellsInCircle`.
  - `jstDay(now: Date): string`. `YYYY-MM-DD` in Asia/Tokyo, boundary 0:00.
  - `tileXY(lat, lng, z: 14): { x: number; y: number }`
  - `findPoi(features: { id?: number|string; name?: string; subclass?: string; lng: number; lat: number }[], osmId: string)`. Returns the matching food POI or null.
- `index.ts`:
  - POST `{shop_id, lat, lng, far_from_home}` with JWT. The user comes from `auth.getUser(token)`.
  - `hp:` → read `shops`; a missing shop is 404.
  - `osm:` → fetch TileJSON `https://tiles.openfreemap.org/planet`, take `tiles[0]`, fetch the z14 tile containing the position, decode it with `npm:@mapbox/vector-tile` + `npm:pbf`, and run `findPoi` on layer `poi`. Upsert `shops` (`shop_id`, `name`, POI position, `genre_name = subclass`). Not found is 404.
  - Distance > 50 → 403 `{error:'too_far', distance_m}`.
  - Call `perform_checkin` with `jstDay(new Date())` and `cellsAround(shop, 200)`.
  - Return `{checkin_id, coins_awarded, new_cells}`.
  - Log nothing with coordinates or the distance.

- [ ] **Step 1: Write `core.test.ts`.**
  - `cellsAround(35.6909, 139.7003, 200)` equals `cellsInCircle(...)` from `src/fog/domain/grid.ts`, mapped to `[x,y]` (sorted).
  - A point 49.9 m away is within `CHECKIN_M`; 50.1 m is not.
  - `jstDay(new Date('2026-11-06T14:59:59Z'))` is `'2026-11-06'`; `jstDay(new Date('2026-11-06T15:00:00Z'))` is `'2026-11-07'`.
  - `tileXY(35.6909, 139.7003, 14)` is `{x: 14549, y: 6451}` (standard slippy-map tile formula).
  - `findPoi` finds `osm:123`, ignores a `parking` POI with the same id, and returns null for an unknown id.
- [ ] **Step 2: Run** `npx vitest run supabase/functions/checkin`. Expected: FAIL.
- [ ] **Step 3: Implement** `core.ts`, `index.ts` and the SQL.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Review the SQL by reading it.** Check that `execute` is not granted to `authenticated`, that the coin is only inserted when `reward_day` was set, and that everything is in one function, so it runs in one transaction.
- [ ] **Step 6: Commit** `feat(checkin): perform_checkin SQL and checkin Edge Function`.

### Task 7: Client check-in API and progress loading

**Files:**
- Create: `src/checkin/infra/checkinApi.ts`, `src/checkin/infra/checkinApi.test.ts`

**Interfaces:**
- `postCheckin(input: { shopId: string; me: LatLng; farFromHome: boolean }, opts?: { fetchFn?; getToken?; endpoint?; anonKey? }): Promise<CheckinResult>`
  - `type CheckinResult = { ok: true; checkinId: string; coins: 30 | 0; newCells: Cell[] } | { ok: false; reason: 'too_far' | 'network' | 'not_found' | 'no_profile' }`
  - Mapping: 403 too_far → `too_far`; 404 → `not_found`; 409 → `no_profile`; network error or 5xx → `network`. There is no automatic retry, so coins are never doubled by a retry.
- `loadProgress(client?: { from(table: string): … }): Promise<{ cells: Cell[]; checkedShopIds: Set<string> }>`
  - Selects `fog_cells(cell_x, cell_y)` and `checkins(shop_id)`; RLS limits both to the user's own rows.
  - Uses the dynamic `import('../../lib/supabase.ts')` like `hotpepper.ts`.
- `farFromHome(home: LatLng | null, me: LatLng): boolean`. True when home exists and is at least 500 m away. It lives in `src/checkin/domain/far.ts` (+ test).

- [ ] **Step 1: Tests.**
  - The request body is exactly `{shop_id, lat, lng, far_from_home}` with no other fields.
  - Each status maps to the right reason.
  - `loadProgress` turns rows into cells and a set.
  - `farFromHome` at 499 m and at 500 m, and with a null home.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** it.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(checkin): client API for check-in and saved progress`.

### Task 8: Fog layer animation and thin spots

**Files:**
- Modify: `src/fog/infra/fogLayer.ts`
- Create: `src/fog/domain/wave.ts`, `src/fog/domain/wave.test.ts`
- Modify: `src/fog/config.ts` (add `WAVE_SPEED_MPS = 210`, `POP_S = 0.55`, `THIN_RADIUS_M = 35`, `THIN_FULL_M = 30`, `THIN_START_M = 50`)

**Interfaces:**
- `wave.ts`:
  - `waveClumps(before: Clump[], after: Clump[], from: { x: number; y: number }, nowS: number): AnimClump[]`
    - `type AnimClump = Clump & { w1: number; start: number }`
    - For each `before` clump: `w1` is the matching `after` clump's `w` (key: rounded x, y and seed) or 0. `start` is `nowS + dist/WAVE_SPEED_MPS`, or `-1` when `w1 === w`.
  - `thinAmount(distM: number): number`. Returns 0 at ≥ `THIN_START_M`, 1 at ≤ `THIN_FULL_M`, smoothstep in between.
- `fogLayer.ts`:
  - The instance layout becomes 6 floats `(x, y, w, seed, w1, start)`, as in the spike. Shader: swell (0–0.35) then shrink to `w1`, fading out if `w1 = 0`, over `POP_S`.
  - `setClumps(origin, clumps: (Clump | AnimClump)[])`. The layer keeps repainting while any `start + POP_S > now`.
  - `setThin(spots: { x: number; y: number; amount: number }[])`. At most 4, in origin metres. A clump within `THIN_RADIUS_M` of a spot gets alpha multiplied by `1 - 0.75*amount*falloff`.
  - Keep the camera-behind guard already in the shader.

- [ ] **Step 1: wave tests.**
  - A clump that disappears gets `w1 = 0` and a start delayed by distance.
  - An unchanged clump gets `start = -1`.
  - A clump that shrinks gets `w1` equal to the new `w`.
  - `thinAmount(60) = 0`, `thinAmount(25) = 1`, `thinAmount(40)` is strictly between 0 and 1.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Port the spike shader changes from `.superpowers/preview/spike/fogLayerSpike.ts`; the uniforms are `u_time` and `u_thin[4]` (vec3).
- [ ] **Step 4: Run** `npm test && npx tsc -b`. Expected: PASS.
- [ ] **Step 5: Look at it.**
  - Run the preview: `.superpowers/preview/vite.fog2.config.mjs` on port 5181, `map-fog.html`.
  - Take one screenshot. The fog must still look like the §12 fog when nothing animates.
- [ ] **Step 6: Commit** `feat(fog): animated clump changes and thin spots`.

### Task 9: World state — saved cleared cells, adding cells with a wave, thinning near in-fog shops

**Files:**
- Modify: `src/map/ui/worldLayers.ts` (+ test), `src/map/ui/MapView.tsx`

**Interfaces:**
- `attachWorld` deps gain `loadProgress: () => Promise<{ cells: Cell[]; checkedShopIds: Set<string> }>`.
- `cleared` becomes a mutable `Set<string>`:
  - It starts from `clearedFromHome(home)`.
  - After `loadProgress` resolves, the server cells are added and the clumps are rebuilt (no wave).
- `attachWorld` returns, in addition:
  - `addCleared(cells: Cell[], from: LatLng): void`. Adds the cells; if any were new, rebuilds the clumps and sends `waveClumps(before, after, from, now)`. When cells is empty, nothing happens.
  - `markChecked(shopId: string): void`
  - `checked(): ReadonlySet<string>`
- Each position update sets `fogLayer.setThin(...)` for shops that are in fog and within 50 m. The amount is `thinAmount(distance)` eased toward its target at about 3 per second.

- [ ] **Step 1: Tests.**
  - `loadProgress` cells are treated as cleared: a shop in such a cell becomes visible.
  - `addCleared` with new cells calls `setClumps` with clumps carrying `start >= 0`.
  - `addCleared([])` does not call `setClumps`.
  - An in-fog shop at 40 m produces a `setThin` call with `amount > 0`.
  - At 70 m, `setThin([])` is called.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Pass `loadProgress` from `MapView`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(fog): saved and newly cleared cells with a wave; thin fog near in-fog shops`.

### Task 10: Tap a shop and the shop sheet

**Files:**
- Modify: `src/shops/infra/shopLayer.ts` (add picking), `src/map/ui/MapView.tsx`, `src/routes/MapPage.tsx` (+ test)
- Create: `src/checkin/ui/ShopSheet.tsx`, `src/checkin/ui/ShopSheet.test.tsx`, `src/checkin/ui/checkin.css`

**Interfaces:**
- `shopLayer.pick(point: { x: number; y: number }): string | null`. Raycast from the screen point using the layer's last camera matrix, with a hit radius around each building at least `sizeM * 0.7`. Returns the shop id.
- `MapView` props gain:
  - `onSelectShop(shop: Shop | null)`
  - `onPosition(me: LatLng)`, throttled to at most 4 per second
- `MapView` exposes `ref.current.checkin(shopId)` (via `useImperativeHandle`). Task 11 fills it in.
- On tap:
  - Find the shop in `world.shopsNear()` and call `onSelectShop`.
  - Run `map.easeTo({ zoom: Math.min(map.getZoom() + 0.6, MAX_ZOOM), duration: 500 })`.
  - A tap on empty map calls `onSelectShop(null)`.
- `ShopSheet({ shop, distanceM, busy, error, onCheckin, onClose })`:
  - Shows a genre badge (a placeholder coloured circle per kind until Shiro's icons arrive), the name, `details.open` (or nothing for map shops), and the distance as `ここから 32m`.
  - The button `チェックイン` is enabled only when `distanceM <= 50` and not `busy`. Otherwise the button shows `あと {ceil(distanceM-50)}m`.
  - Error texts:
    - too_far: `お店から50mより遠いようです`
    - network: `通信できませんでした。もう一度押してください`
    - not_found: `このお店は見つかりませんでした`
    - no_profile: `初回設定を終えてからチェックインできます`

- [ ] **Step 1: ShopSheet tests.**
  - At 50 m the button is enabled; at 50.4 m it is disabled and shows `あと 1m`.
  - While `busy` it is disabled.
  - Each error text renders.
  - A map shop (`details` null) renders without hours.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `MapPage` holds the selected shop and the current `me`.
  - `onCheckin` calls `postCheckin`. While it runs, `busy` is true, so a second press does nothing.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(checkin): tap a shop to open the shop sheet`.

### Task 11: Check-in effect — confetti, banner, check mark, fog wave

**Files:**
- Create:
  - `src/checkin/ui/CheckinEffect.tsx`, `src/checkin/ui/CheckinEffect.test.tsx`
  - `src/checkin/ui/confetti.ts` (canvas, no React)
- Modify: `src/routes/MapPage.tsx`, `src/map/ui/MapView.tsx`, `src/checkin/ui/checkin.css`

**Interfaces:**
- `CheckinEffect({ coins, shopName, onDone })`:
  - Confetti (about 1.2 s), then a green banner `チェックイン完了` with `+30 コイン`. When `coins === 0` the banner reads `今日のコインは受け取り済み`.
  - It ends about 3 s after start. A tap skips to the end and calls `onDone` once.
  - Respect `prefers-reduced-motion`: no confetti, banner only.
- On a successful check-in, `MapPage`:
  1. closes the sheet
  2. shows `CheckinEffect`
  3. calls the map handle `checkin(shopId)`. At about 0.9 s, `MapView` calls `world.markChecked(id)` and `world.addCleared(result.newCells, shop)`.
- Check mark: a `maplibregl.Marker` with a small white circle and a green check (CSS, placeholder until Shiro's art), above each visible checked shop. Its offset is `-sizeM*1.4` px at zoom 17, kept simple. Markers are updated on shop refresh.

- [ ] **Step 1: CheckinEffect tests.**
  - The banner text for 30 coins and for 0.
  - `onDone` is called once after the timer (fake timers), and once when tapped. A tap after the end does not call it again.
  - Reduced motion renders no confetti canvas.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npx tsc -b && npm run lint`. Expected: PASS.
- [ ] **Step 5: Look at it.**
  - Record one run with the preview harness and a stubbed `postCheckin` returning 3 new cells.
  - Check the order: confetti → banner → wave.
- [ ] **Step 6: Commit** `feat(checkin): confetti, banner, check mark and the fog wave`.

### Task 12: Credit, Shiro request, docs, deploy notes

**Files:**
- Modify:
  - `src/routes/MapPage.tsx` (credit link in the map overlay)
  - `src/credits/Splash.tsx` (+ `credits.test.tsx`)
  - `CLAUDE.md` 現状
  - `docs/learning-log.md` (new entry 12, owner's 感想 placeholder)
  - `docs/session-handoff.md`
  - `docs/basic-design.md` (N-05 decided: confetti and banner, no card; N-10: credit, 24 h cache)
- Create:
  - `handoff/to-shiro/2026-11-06-checkin-effect-art.md`, with the four items in spec §9 verbatim, `状態: 未対応`. Add one line to `handoff/LOG.md`.
  - `docs/superpowers/plans/2026-11-06-hotpepper-checkin-deploy.md`, the owner's steps in Japanese:
    1. Run `0002_checkin.sql` in the dev SQL editor. First check that `0001` tables exist.
    2. Deploy `shops-hotpepper` and `checkin` (Via Editor, both files `index.ts` + `core.ts`, Verify JWT on).
    3. Delete `shops-overpass`.
    4. Check on iPhone.

**Interfaces:** none new.

- [ ] **Step 1: Test.**
  - `MapPage` renders a link named `Powered by ホットペッパーグルメ Webサービス` with `href="http://webservice.recruit.co.jp/"`.
  - The splash lists it.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** it, and write the docs.
- [ ] **Step 4: Run** `npm test && npm run build && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `docs: credit, Shiro art request, deploy steps, records`. Push the branch, then update `dev` with the merge-tree method in `docs/session-handoff.md`.

### Task 13: Device check (owner, with Claude)
- [ ] The owner follows the deploy notes.
- [ ] On iPhone, check that:
  - map shops and HotPepper shops appear
  - an in-fog shop within 50 m shows through thinned clouds
  - check-in works, with confetti, banner and wave
  - after reopening the app, the cleared area and check mark remain
  - a second check-in the same day shows `今日のコインは受け取り済み`
- [ ] Measure smoothness while the wave runs.
- [ ] Confirm the HotPepper genre codes from the function output, and fix `kind.ts` if needed.
- [ ] Count, around home, HotPepper shops vs map shops (spec §8), and report the numbers.
