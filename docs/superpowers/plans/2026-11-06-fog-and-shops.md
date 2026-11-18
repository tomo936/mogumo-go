# 霧（3Dの雲の海）とお店の3D模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 地図を霧（雲の海の模様＋3Dの雲）で覆い、自宅から 200m を最初から晴らし、晴れた場所にあるお店（Overpass の仮データ）を13種類の3D建物で道路向きに立てる。

**Architecture:** `src/fog/` と `src/shops/` を domain（セル・晴れ・雲の場所・ジャンル・置き方・表示の選び方）／infra（three.js のレイヤー・模様の canvas・Overpass・地図のタイルからの道路と建物）／ui（MapView へのつなぎ）に分ける。three.js は infra に閉じ、MapView は今どおり ref だけで動き React を再描画しない。

**Tech Stack:** React 19 / maplibre-gl 6 / three（新規）/ Vitest / Blender 4.2（素材づくり、作業用フォルダ）

**Spec:** `docs/superpowers/specs/2026-11-06-fog-and-shops-design.md`

## Global Constraints

- 作業ブランチ `cycle1-fog-shops`（今の `cycle1-setup` から作る）
- CLAUDE.md のツールチェーン規則とクリーンアーキテクチャ（domain は three・MapLibre・fetch・ブラウザ API を import しない）
- three は npm で `three@0.170.0`（固定）と `@types/three@0.170.0`。ほかの依存は足さない
- 自宅の座標・自宅まわりのセルを、サーバー・Overpass・URL・ログ・console に出さない。Overpass に送る中心は常に「現在地」
- 調整値は `src/fog/config.ts` と `src/shops/config.ts`（何も import しない）に置く:
  - fog: `CELL_M = 25`, `REF_LAT_DEG = 35`, `HOME_CLEAR_RADIUS_M = 200`, `CLOUD_GAP_M = 60`, `CLOUD_REACH_M = 1500`, `CLOUD_CLEAR_MARGIN_M = 45`, `CLOUD_CHUNK_M = 300`, `SEA_HALF_M = 1500`, `SEA_REBUILD_M = 700`, `SEA_TILE_M = 320`
  - shops: `SHOP_RADIUS_M = 1000`, `SHOP_REFETCH_M = 500`, `MAX_SHOPS = 40`, `SHOP_MIN_SIZE_M = 14`, `SHOP_MAX_SIZE_M = 30`, `OVERPASS_URL = 'https://overpass-api.de/api/interpreter'`, `OVERPASS_RETRY_WAIT_MS = 3000`
- セルの式: `dLat = CELL_M / 111195`, `dLng = CELL_M / (111195 × cos(REF_LAT_DEG°))`, `x = floor(lng / dLng)`, `y = floor(lat / dLat)`。キー文字列は `` `${x}:${y}` ``
- お店の種類 `ShopKind` = `'ramen' | 'sushi' | 'soba' | 'washoku' | 'izakaya' | 'chinese' | 'yakiniku' | 'western' | 'curry' | 'cafe' | 'cake' | 'bakery' | 'mystery'`（ファイル名と同じ）
- Overpass を使うのは `import.meta.env.DEV` または `location.hostname === 'mogumo-go-dev.vercel.app'` のときだけ
- 文言（そのまま）: お店の取得に失敗したときの帯「お店を読み込めませんでした」
- 模型: 1種類 1万三角形以内・400KB 以内。雲 1個 約800三角形
- 各タスクの終わりに `npm test`・`npx tsc -b`・`npx oxlint src` が通ること

## Review Focus

1. **自宅が設定されていない（初回設定の途中・別の端末）** → 霧は全部雲、お店は出ない、エラーにならない（Task 3・Task 10 のテスト）
2. **Overpass が遅い・429・壊れた JSON を返す** → 1回だけやり直し、だめなら帯を出し、地図と霧はそのまま動く。同時に2本投げない（Task 7 のテスト）
3. **晴れた場所に同じ種類の店が40軒より多い** → 近い順に40軒だけ描く（Task 6 のテスト）
4. **歩いて現在地が動き続ける** → 500m 動くまで Overpass に問い合わせない、700m 動くまで模様を作り直さない（Task 10 のテスト）
5. **店の点のまわりに道路も建物も無い（公園の中など）** → 南向きで 14m の大きさで置く、例外にならない（Task 5 のテスト）

---

### Task 1: 素材（軽い glb）と three の追加

**Files:**
- Modify: `art/prototypes/blender-shops.py`, `art/prototypes/blender-shop-jp.py`, `art/prototypes/blender-cloud3d.py`（`LIGHT=1` で、レンダリングをせず、`DECIMATE` で 1万三角形以内に減らした glb を `<out>/<kind>.glb` に書く）
- Create: `src/assets/shops/<kind>.glb`（13個。ramen は `blender-shop-jp.py` の KIND=ramen、ほかは `blender-shops.py`）、`src/assets/fog/cloud1.glb`〜`cloud3.glb`
- Modify: `vite.config.ts`（`assetsInclude: ['**/*.glb']`）, `package.json`
- Create: `src/vite-env.d.ts` に `declare module '*.glb' { const url: string; export default url }`（無ければ）
- Test: `src/assets/assets.test.ts`

- [ ] **Step 1: 失敗するテストを書く** — `assets.test.ts`: `import.meta.glob('./shops/*.glb', { eager: true, query: '?url', import: 'default' })` のキーが 13 個で、上の `ShopKind` の13の名前と一致する。`./fog/cloud*.glb` が 3 個。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run src/assets/assets.test.ts` → FAIL（0 個）
- [ ] **Step 3: glb を作る** — Blender（`$SCRATCH/blender/blender-4.2.3-linux-x64/blender -b -P <script> -- <out>`、`KIND=<kind> LIGHT=1`）。書き出し前に、全部の形をつなげて Decimate（collapse）で 1万三角形以内にし、`export_apply=True` で書く。曲線（瓦の筋）は先に形に変える（今の手順どおり）。雲は今の `DEC=0.07` のまま。
- [ ] **Step 4: 大きさを確かめる** — `ls -l src/assets/shops/*.glb` が全部 400KB 以下。各手順の `TRIS` の出力が 10000 以下。
- [ ] **Step 5: three を入れる** — `npm install three@0.170.0 && npm install -D @types/three@0.170.0`
- [ ] **Step 6: テストが通る** — `npx vitest run src/assets/assets.test.ts` → PASS、`npm run build` が通る
- [ ] **Step 7: Commit** — `feat(assets): light shop and cloud glb models; add three`

### Task 2: 霧のセル（domain）

**Files:** Create `src/fog/config.ts`, `src/fog/domain/grid.ts`; Test `src/fog/domain/grid.test.ts`

**Interfaces:**
- Produces: `type Cell = { x: number; y: number }`、`cellOf(p: LatLng): Cell`、`cellCenter(c: Cell): LatLng`、`cellKey(c: Cell): string`、`cellsInCircle(center: LatLng, radiusM: number): Cell[]`（セルの中心が円の中にあるもの）

- [ ] **Step 1: 失敗するテスト** —
  - `cellOf(cellCenter({x: 5585, y: -2}))` が `{x: 5585, y: -2}` に戻る（負の番号も）
  - 東京駅 `{lat: 35.6812, lng: 139.7671}` のセルの中心から `distanceMeters` で 18m 以内
  - `cellKey({x: 3, y: -4}) === '3:-4'`
  - `cellsInCircle(東京駅, 200)` の数が 160〜220（π×200²/25² ≈ 201）で、どのセルの中心も 200m 以内
  - `cellsInCircle(p, 0)` は空
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run src/fog/domain/grid.test.ts` → FAIL
- [ ] **Step 3: 実装** — Global Constraints の式どおり。`cellsInCircle` は外接する四角のセルを回して中心距離で絞る。
- [ ] **Step 4: 通る** — 同じコマンド → PASS
- [ ] **Step 5: Commit** — `feat(fog): world-fixed 25m fog grid`

### Task 3: 晴れたセルと雲の場所（domain）

**Files:** Create `src/fog/domain/clearing.ts`, `src/fog/domain/cloudSpots.ts`; Test 同名の `.test.ts`

**Interfaces:**
- Consumes: Task 2 の `Cell`, `cellOf`, `cellKey`, `cellsInCircle`, `cellCenter`
- Produces:
  - `type Cleared = ReadonlySet<string>`（セルのキー）
  - `clearedFromHome(home: LatLng | null): Set<string>`（`HOME_CLEAR_RADIUS_M` の円。`null` は空）
  - `isClearedAt(cleared: Cleared, p: LatLng): boolean`
  - `distanceToCleared(cleared: Cleared, p: LatLng, maxM: number): number`（いちばん近い晴れセルの中心まで。`maxM` までに無ければ `Infinity`）
  - `type CloudSpot = { lat: number; lng: number; widthM: number; heightM: number; rotRad: number; kind: 0 | 1 | 2 }`
  - `cloudSpots(center: LatLng, cleared: Cleared): CloudSpot[]`
  - `chunkOf(s: CloudSpot): string`（`CLOUD_CHUNK_M` 四方の区画のキー）

- [ ] **Step 1: 失敗するテスト（clearing）** — `clearedFromHome(null).size === 0`。自宅から 150m の点は `isClearedAt` が true、260m は false。`distanceToCleared` は自宅の上で 25 未満、自宅から 400m の点で 180〜230、`maxM = 100` で `Infinity`。
- [ ] **Step 2: 失敗するテスト（cloudSpots）** —
  - 同じ入力で2回呼ぶと深く等しい（`toEqual`）。中心を 30m ずらしても、両方に入る範囲の雲は同じ場所・同じ大きさ（場所が世界で固定の格子から決まる）
  - どの雲も、晴れたセルから `CLOUD_CLEAR_MARGIN_M` 以内に無い
  - どの雲も中心から `CLOUD_REACH_M` 以内
  - 晴れが無いとき、雲の数は 1500〜2600（(3000/60)² の格子のうち円の中）
  - 晴れに近い雲ほど `heightM` が小さい（晴れから 60m の雲の `heightM` < 400m の雲の最大）
  - `chunkOf` は 300m 以内の2点で同じ、600m 離れた2点で違う
- [ ] **Step 3: 失敗を確かめる** — `npx vitest run src/fog/domain` → FAIL
- [ ] **Step 4: 実装** — 雲は `CLOUD_GAP_M` 刻みの世界固定の格子（`cellOf` の番号を `CLOUD_GAP_M / CELL_M` で割った格子）の各点に1つ。乱数は格子番号から決まるハッシュ（`Math.random` を使わない）。点を格子の中で ±0.45 間ずらす。`d = distanceToCleared(..., 400)`、`k = clamp((d - 40) / 320, 0, 1)`、`widthM = (60 + 50r1)(0.7 + 0.5k)`、`heightM = (8 + 40r2)k`、`rotRad = (r3 - 0.5) × 0.5`、`kind = floor(r4 × 3)`（試作 `fog.ts` の値）。
- [ ] **Step 5: 通る** → PASS
- [ ] **Step 6: Commit** — `feat(fog): cleared cells around home and deterministic cloud spots`

### Task 4: お店の種類（domain）

**Files:** Create `src/shops/config.ts`, `src/shops/domain/shop.ts`, `src/shops/domain/genre.ts`; Test `genre.test.ts`

**Interfaces:**
- Produces: `type ShopKind`（Global Constraints）、`type Shop = { id: string; name: string; lat: number; lng: number; kind: ShopKind }`、`kindOf(tags: Record<string, string>, name: string): ShopKind`

- [ ] **Step 1: 失敗するテスト（表で）** — spec 4.4 の表の上から順:
  - `{amenity:'restaurant', cuisine:'ramen'}` → ramen ／ 名前「麺屋 らーめん太郎」 → ramen ／ 「中華そば 青葉」 → ramen
  - `cuisine:'sushi'` → sushi ／ 名前「鮨 さかな」 → sushi
  - `cuisine:'soba;udon'` → soba ／ 名前「手打ち蕎麦」 → soba
  - `cuisine:'indian'` → curry ／ 名前「カレーの店」 → curry
  - `cuisine:'korean'` → yakiniku、`cuisine:'chinese'` → chinese、`cuisine:'pizza'` → western
  - `cuisine:'japanese'` → washoku、`cuisine:'yakitori'` → izakaya、`{amenity:'pub'}` → izakaya
  - `{shop:'confectionery'}` → cake、`{amenity:'ice_cream'}` → cake、`{shop:'bakery'}` → bakery
  - `{amenity:'cafe'}` → cafe、`{amenity:'cafe', cuisine:'cake'}` → cake
  - `{amenity:'fast_food', cuisine:'burger'}` → mystery、`{amenity:'restaurant'}` → mystery
  - `cuisine` が `;` 区切りの複数でも判定する（`'japanese;sushi'` → sushi：表の上の行が優先）
- [ ] **Step 2: 失敗を確かめる** → FAIL
- [ ] **Step 3: 実装** — 表を配列（条件→種類）で持ち、上から最初に合ったもの。名前は大文字小文字・全角半角をそろえずそのまま `includes`。
- [ ] **Step 4: 通る** → PASS
- [ ] **Step 5: Commit** — `feat(shops): map OSM tags and names to 13 shop kinds`

### Task 5: お店の置き方（domain）

**Files:** Modify `src/map/domain/geo.ts`（`localFrame` を足す）; Create `src/shops/domain/placement.ts`; Test `placement.test.ts`, `geo.test.ts` に追記

**Interfaces:**
- Produces:
  - `type P = { x: number; y: number }`（m、東・北）、`localFrame(origin: LatLng): { to(p: LatLng): P; back(p: P): LatLng }`（`src/map/domain/geo.ts`）
  - `type Placement = { center: P; facingDeg: number; sizeM: number; onFootprint: boolean }`（`facingDeg` は北=0・時計回り）
  - `placeShop(roads: P[][], footprints: P[][]): Placement`（店の点は原点 `{x:0,y:0}`。`SHOP_MIN_SIZE_M`〜`SHOP_MAX_SIZE_M`）

- [ ] **Step 1: 失敗するテスト** —
  - `localFrame` の `to` → `back` で 0.01m 以内に戻る
  - 輪郭あり: 原点を含む 20m×12m の四角（中心 (2,-1)）と、北 15m の東西の道路 → `onFootprint` true、`center` ≈ (2,-1)、`facingDeg` ≈ 0（±1）、`sizeM` = 14（小さい辺 12 を 14 に切り上げ）
  - 大きな輪郭（60m×50m）→ `sizeM` = 30
  - 輪郭なし・東 5m に南北の道路 → `onFootprint` false、`facingDeg` ≈ 90、`center.x` ≈ -6（14/2 + 4 − 5 だけ道路から離す）
  - 輪郭なし・道路なし → `facingDeg` = 180、`center` = (0,0)、`sizeM` = 14、例外なし
  - 時計回りの輪郭でも外向きの辺を選ぶ（同じ四角を逆順で与えて同じ結果）
- [ ] **Step 2: 失敗を確かめる** → FAIL
- [ ] **Step 3: 実装** — 試作 `art/prototypes/map-shop-placement.ts.txt` の `placeShop` の規則を、地図を使わない純粋な関数に移す（道路クラスの絞り込みは infra 側で済ませた線が来る）。
- [ ] **Step 4: 通る** → PASS
- [ ] **Step 5: Commit** — `feat(shops): road-facing, footprint-fitted placement`

### Task 6: 表示するお店の選び方（domain）

**Files:** Create `src/shops/domain/visibility.ts`; Test `visibility.test.ts`

**Interfaces:**
- Consumes: `Shop`（Task 4）、`Cleared`, `isClearedAt`（Task 3）
- Produces: `visibleShops(shops: Shop[], me: LatLng, cleared: Cleared): Shop[]`（`SHOP_RADIUS_M` 以内・晴れたセルにある・近い順・`MAX_SHOPS` 件まで）

- [ ] **Step 1: 失敗するテスト** — 晴れの外の店は出ない／1km より遠い店は出ない／50軒の晴れた店から近い順に40軒、先頭がいちばん近い／空配列で空
- [ ] **Step 2〜4:** FAIL → 実装 → PASS
- [ ] **Step 5: Commit** — `feat(shops): choose visible shops in cleared cells`

### Task 7: Overpass からお店を取る（infra）

**Files:** Create `src/shops/infra/overpass.ts`; Test `overpass.test.ts`、見本 `src/shops/infra/__fixtures__/overpass.json`（node 3件・way 1件・名前なし 1件）

**Interfaces:**
- Consumes: `kindOf`, `Shop`
- Produces:
  - `overpassQuery(center: LatLng, radiusM: number): string`
  - `parseOverpass(json: unknown): Shop[]`（`id` は `` `osm:${type}/${id}` ``、way は `center`、名前なしは捨てる、壊れた形は空配列）
  - `fetchShops(center: LatLng, opts?: { fetchFn?: typeof fetch; waitMs?: number }): Promise<Shop[]>`（429・5xx・ネットワーク失敗・タイムアウト 25 秒で `waitMs` 待って1回だけやり直し、だめなら `Error('shops_unavailable')`）
  - `shopSourceEnabled(dev: boolean, hostname: string): boolean`

- [ ] **Step 1: 失敗するテスト** —
  - `overpassQuery` に `around:1000,35.6812,139.7671`、`amenity~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$"`、`shop~"^(bakery|confectionery|pastry)$"`、`["name"]`、`out center` が入る
  - 見本から4件（名前なしを捨てる）、way の座標は center、種類は `kindOf` の結果
  - `parseOverpass(null)`・`parseOverpass({elements: 'x'})` は `[]`
  - にせの fetch が 1回目 429・2回目 200 → 結果が返り、fetch は2回
  - 2回とも 429 → `shops_unavailable` で reject、fetch は2回
  - `shopSourceEnabled(true, 'localhost')` true、`(false, 'mogumo-go-dev.vercel.app')` true、`(false, 'mogumo-go.vercel.app')` false
- [ ] **Step 2〜4:** FAIL → 実装（POST で `data=` を送る）→ PASS
- [ ] **Step 5: Commit** — `feat(shops): temporary shop source from Overpass (dev only)`

### Task 8: 地図のタイルから道路と建物を取り出す（infra）

**Files:** Create `src/shops/infra/mapFeatures.ts`; Test `mapFeatures.test.ts`

**Interfaces:**
- Consumes: `localFrame`, `P`
- Produces: `type FeatureSource = { querySourceFeatures(source: string, opts: { sourceLayer: string }): { geometry: GeoJSON.Geometry; properties: Record<string, unknown> }[] }`、`roadsAndFootprints(src: FeatureSource, origin: LatLng, rangeM?: number): { roads: P[][]; footprints: P[][] }`（`openmaptiles` の `transportation` のうち class が `motorway|trunk|primary|secondary|tertiary|minor|service|street|path|pedestrian`、`building` の Polygon と MultiPolygon の外周。原点から `rangeM`（既定 60）より遠いものは捨てる）

- [ ] **Step 1: 失敗するテスト** — にせの source（LineString・MultiLineString・class が `rail` の線・Polygon・MultiPolygon・100m 先の建物）から、道路2本（rail を除く）と輪郭2つ（遠いものを除く）が m で返る
- [ ] **Step 2〜4:** FAIL → 実装 → PASS
- [ ] **Step 5: Commit** — `feat(shops): extract roads and building footprints from map tiles`

### Task 9: three.js のレイヤー（雲・模様・建物）（infra）

**Files:** Create `src/fog/infra/seaLayer.ts`, `src/fog/infra/cloudLayer.ts`, `src/shops/infra/shopLayer.ts`, `src/lib/threeLayer.ts`（MapLibre のカスタムレイヤーで three を描く共通の部品）; Test `seaLayer.test.ts`, `threeLayer.test.ts`

**Interfaces:**
- Consumes: `CloudSpot`, `chunkOf`, `Cleared`, `cellCenter`, `ShopKind`
- Produces:
  - `seaBounds(center: LatLng, halfM: number): [[number, number], [number, number], [number, number], [number, number]]`（北西・北東・南東・南西の [lng, lat]）
  - `addSea(map: maplibregl.Map, center: LatLng, cleared: Cleared): { update(center: LatLng, cleared: Cleared): void; remove(): void }`（canvas source＋raster レイヤー `fog-sea`。模様 1枚 `SEA_TILE_M`、晴れセルの中心にやわらかい縁の円をくり抜く）
  - `modelMatrix(origin: LatLng, p: { lat: number; lng: number }, scale: number, rotRad: number): number[]`（16要素。three の Matrix4 の配列。`src/lib/threeLayer.ts`）
  - `createCloudLayer(): CustomLayerInterface & { setSpots(spots: CloudSpot[], origin: LatLng): void }`（id `fog-clouds`。種類ごと・区画ごとに `InstancedMesh`、`computeBoundingSphere` で画面外の区画を描かない）
  - `type PlacedShop = { id: string; kind: ShopKind; lat: number; lng: number; facingDeg: number; sizeM: number }`
  - `createShopLayer(): CustomLayerInterface & { setShops(shops: PlacedShop[]): void }`（id `shops-3d`。種類の glb は初めて要るときに読む。光は試作どおり空の光＋太陽、材質はマット）
- [ ] **Step 1: 失敗するテスト** — `seaBounds` の4点が中心から東西南北に `halfM`（±1m、`distanceMeters` で確かめる）、順番が北西→北東→南東→南西。`modelMatrix` で原点そのものを入れると平行移動の成分が `MercatorCoordinate.fromLngLat(origin)` と一致し、`scale` が `meterInMercatorCoordinateUnits()×scale` で入る。
- [ ] **Step 2〜4:** FAIL → 実装（試作 `art/prototypes/map-clouds3d-layer.ts.txt`・`map-shops3d-layer.ts.txt`・`.superpowers/preview/fog.ts` の assetCanvas を移す）→ PASS
- [ ] **Step 5: Commit** — `feat(fog,shops): three.js layers for clouds, cloud sea and shop buildings`

### Task 10: MapView へのつなぎと「歩いたふり」を自宅から（ui）

**Files:**
- Create: `src/map/ui/worldLayers.ts`（霧とお店の組み立て）; Test `worldLayers.test.ts`
- Modify: `src/map/ui/MapView.tsx`（props に `home: LatLng | null`・`onShopsError: () => void`。`load` のあと `attachWorld`、位置が変わるたびに `onPosition`）、`src/routes/MapPage.tsx`（`useAuth` の user から `loadHome` して渡す。`onShopsError` で帯）、`src/map/infra/fakeWalk.ts` の呼び出し（自宅があれば自宅から）; Test `MapPage.test.tsx` に追記

**Interfaces:**
- Consumes: 上の全部
- Produces: `attachWorld(map: maplibregl.Map, deps: { home: LatLng | null; fetchShops: (c: LatLng) => Promise<Shop[]>; shopsEnabled: boolean; onShopsError(): void }): { onPosition(p: LatLng): void; dispose(): void }`

- [ ] **Step 1: 失敗するテスト（worldLayers、map と three はにせもの）** —
  - 最初の `onPosition` で雲の場所と模様が作られ、`fetchShops` が現在地で1回呼ばれる
  - 400m 動いても `fetchShops` は増えない、520m で2回目。720m で模様を作り直す（`update` が呼ばれる）
  - 取得中に次の `onPosition` が来ても、同時に2本目は投げない
  - `home: null` で例外なし、晴れなし、建物は0軒
  - `shopsEnabled: false` で `fetchShops` を呼ばない
  - `fetchShops` が reject → `onShopsError` が1回
  - `fetchShops` に渡る座標は現在地で、自宅の座標ではない（自宅と現在地を別の点にして確かめる）
- [ ] **Step 2: 失敗するテスト（MapPage）** — `onShopsError` で「お店を読み込めませんでした」が出る
- [ ] **Step 3: 失敗するテスト（fakeWalk）** — `startFakeWalk(onFix, home)` の最初の点が自宅から 2m 以内（今の関数は `start` を受け取れるので、呼び出し側のテストでよい）
- [ ] **Step 4: 失敗を確かめる** → FAIL
- [ ] **Step 5: 実装** — 建物の置き方は、店ごとに初めて表示するときに `roadsAndFootprints(map, 店の点)` → `placeShop` を1回だけ計算して覚える（タイルがまだ無いときは次の位置更新でもう一度）。
- [ ] **Step 6: 通る** → `npm test` 全部 PASS、`npx tsc -b`、`npx oxlint src`
- [ ] **Step 7: Commit** — `feat(map): fog and shop buildings on the map; fake walk starts at home`

### Task 11: 実機の確認と記録

**Files:** Modify `CLAUDE.md`（「現状」に `src/fog/`・`src/shops/`）、`docs/basic-design.md`（N-18・N-27 を「実装済み（仮データ Overpass）」に）、`docs/learning-log.md`（10件目）

- [ ] **Step 1: PC で確認** — `npm run dev` で `/?fake` を開き、自宅まわりが晴れ、雲の海が広がり、晴れた場所に建物が道路向きに立つことをスクリーンショットで確かめる
- [ ] **Step 2: 開発環境へ** — `dev` ブランチへ fast-forward して push（本番 `main` には出さない。この環境から push できないときは、本人に `! git push origin dev` を頼む）。iPhone 16 で mogumo-go-dev を開いて、動きが滑らかか本人に見てもらう（重ければ `CLOUD_GAP_M`・`CLOUD_REACH_M`・`MAX_SHOPS` を調整して記録）
- [ ] **Step 3: 記録を更新して Commit** — `docs: record fog and shops step`
