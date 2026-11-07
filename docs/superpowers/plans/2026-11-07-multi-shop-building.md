# 同じ建物に複数のお店（ビル）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同じ建物の輪郭に入っている2軒以上のお店を、ビルの模型1つ＋上のピン＋タップで一覧、にまとめる。

**Architecture:** 置き方の計算（`placeShop`）が輪郭に合わせた中心を返すので、見えている店のうち中心が 1m 以内でそろうものを1組にする（domain `groupShops`）。組は `shopLayer` に `model: 'building'` の1件として渡し、ピンは HTML マーカー（`buildingPins`）。タップは「店の id の配列」で返し、1件ならお店のシート、2件以上ならビルの一覧のシート。

**Tech Stack:** React 19 / TypeScript / MapLibre GL / three.js（InstancedMesh）/ Vitest / Blender 4.2（模型）

**Spec:** `docs/superpowers/specs/2026-11-07-multi-shop-building-design.md`

## Global Constraints
- CLAUDE.md のツールチェーンの注意（`import type`・拡張子つき import・enum 禁止・未使用で落ちる）。
- domain は React・MapLibre・three・ブラウザ API を import しない。`src/shops/config.ts` は何も import しない。
- まとめるのは「見えている店」（`visibleShops` の結果）だけ。霧の中の店で組を作らない。
- チェックイン（50m はお店の点から・1日1回・演出）は変えない。
- 6軒以上の組もこの段ではビル（ピンは常に1つ＋「済み/全部」）。
- 新しい調整値（`src/shops/config.ts`）: `BUILDING_MAX_SIZE_M = 22`、`BUILDING_SAME_M = 1`、`PIN_GAP_PX = 34`、`PIN_COLLAPSE_ZOOM = 16`、`PIN_MAX_SPREAD = 5`、`BUILDING_PIN_OFFSET_PER_SIZE = 2.4`、`BUILDING_CENTER_RISE_RATE = 0.9`（値は Task 7 の実機確認で直してよい）。
- 返事・画面の文字は日本語。

## Review Focus
1. 1つの組の中で、一部の店だけ見えている → 見えている店だけでビル（1軒しか見えていなければふつうの店）。Task 5 のテストで固める。
2. 済みの店がビルに入ったとき、別の ✓ 印が二重に出ない（ピンの ✓ だけ）。Task 5。
3. ピンを押したとき、地図のタップ（建物の当たり判定）も同時に走らない。Task 4 のテスト。
4. 一覧のシートとお店のシートが同時に出ない（行を押したら一覧は閉じる）。Task 6。
5. 縮小と拡大を行き来してもピンが増え続けない（作り直しで古いマーカーを消す）。Task 4。

---

### Task 1: 組分け（domain）と、ビルの置き方

**Files:**
- Create: `src/shops/domain/grouping.ts`, `src/shops/domain/grouping.test.ts`
- Modify: `src/shops/domain/placement.ts`（`placeShop` に大きさの上限の引数）, `src/shops/domain/placement.test.ts`, `src/shops/config.ts`

**Interfaces:**
- Produces:
  - `export type Groupable = { id: string; footprintCenter: P | null }` — 輪郭に合わせて置いたときの中心（m、同じ原点）。輪郭の外は null
  - `export function groupShops(items: readonly Groupable[], sameM?: number): string[][]` — 並び順は items の順（最初に出た店の位置に組を置く）。null は必ず1軒の組
  - `placeShop(roads: P[][], footprints: P[][], maxSizeM?: number): Placement` — 既定は `SHOP_MAX_SIZE_M`

- [ ] **Step 1: テストを書く** `grouping.test.ts`
  - `中心が 0.5m 以内の2軒は1組` → `[['a','b']]`
  - `中心が 2m 離れていれば別の組` → `[['a'],['b']]`
  - `輪郭の外（null）は同じ点でも1軒ずつ` → `[['a'],['b']]`
  - `6軒でも1組、並びは入力の順` → `[['a','b','c','d','e','f']]`
  - `組の位置は最初に出た店の順` : 入力 a(組X), c(単独), b(組X) → `[['a','b'],['c']]`
  - `placement.test.ts`: `大きな輪郭（30m角）は maxSizeM=22 なら 22、既定なら 18`
- [ ] **Step 2:** `npx vitest run src/shops/domain` → 新しいテストが FAIL
- [ ] **Step 3:** 実装。`groupShops` は組ごとに代表の中心を持ち、`Math.hypot` が `sameM`（既定 `BUILDING_SAME_M`）未満の組に入れる。`clampSize` を上限つきにする。config に Global Constraints の値を足す
- [ ] **Step 4:** `npx vitest run src/shops/domain` → PASS
- [ ] **Step 5:** commit `feat(shops): group shops sharing a footprint`

### Task 2: ビルの模型（Blender）

**Files:**
- Create: `art/prototypes/blender-building.py`, `src/assets/shops/building.glb`, `art/prototypes/building-preview.png`
- Modify: `src/assets/assets.test.ts`（13種＋`building`）

- [ ] **Step 1:** `assets.test.ts` を「13種＋building がそろっている」に変える → FAIL
- [ ] **Step 2:** `blender-building.py` を `blender-shops.py` の部品（`mat`・`cube`・`cyl`・`finish`）の書き方で作る。見本 `art/reference/shops/building-multi.png`: クリーム色のタイル壁・3階・各階に明かりの窓（カーテン）・屋上にふち＋タンク＋室外機・1階の正面（-Y）と右側面に店先（白いひさし／赤いひさし）。ショーケースの中身は汎用（あたたかい明かり・カウンター・小さなテーブル）で、パンや料理は置かない。底面は正方形（幅1）、高さは幅の約1.35倍。glb は正面 +Z（既存の店と同じ書き出し）。**三角形は 4万以下**（店と同じくらい）
- [ ] **Step 3:** 書き出し＋見本と並べた確認画像 `building-preview.png`（PNG）を作り、本人に送る（SendUserFile）。OK をもらう
- [ ] **Step 4:** `npm test -- src/assets` → PASS
- [ ] **Step 5:** commit `art: multi-shop building model`

### Task 3: 層と当たり判定（infra）

**Files:**
- Modify: `src/shops/infra/shopLayer.ts`, `src/shops/infra/pickShop.ts`, `src/shops/infra/pickShop.test.ts`

**Interfaces:**
- Produces:
  - `PlacedShop = { id: string; model: ShopKind | 'building'; shopIds: string[]; lat; lng; facingDeg; sizeM }` — `kind` を `model` に改名。1軒の店は `shopIds: [id]`、ビルは `id: 'bldg:<先頭の店 id>'`・`shopIds` に全員
  - `shopLayer.pick(point): string[] | null` — 押された建物の `shopIds`
  - `pickShop(...)` は `PlacedShop` を返す（`string` でなく）

- [ ] **Step 1:** `pickShop.test.ts` に `ビルは当たりの中心が高い（sizeM×0.9 上）` を足す: 同じ sizeM の店とビルで、根元から sizeM×0.85 上を押すと、ビルだけ当たる。既存テストは `kind`→`model` に直す
- [ ] **Step 2:** `npx vitest run src/shops/infra/pickShop.test.ts` → FAIL
- [ ] **Step 3:** 実装。`pickShop` の高さの割合は `model === 'building' ? BUILDING_CENTER_RISE_RATE : CENTER_RISE_RATE`。`shopLayer` の模型の読み込みと組分けのキーを `model` にし、`urlOf('building')` が `building.glb` を指すようにする
- [ ] **Step 4:** `npx vitest run src/shops/infra` と `npx tsc -b` → PASS（ここで型エラーになる呼び出し側は Task 5 で直すので、`tsc` は Task 5 まで落ちてよい。テストは通す）
- [ ] **Step 5:** commit `feat(shops): building model in shop layer and picking`

### Task 4: ビルのピン（domain の並べ方＋infra のマーカー）

**Files:**
- Create: `src/shops/domain/pins.ts`, `src/shops/domain/pins.test.ts`, `src/shops/infra/buildingPins.ts`, `src/shops/infra/buildingPins.test.ts`
- Modify: `src/checkin/ui/checkin.css`（ピンの見た目。`.check-mark` の近くに）

**Interfaces:**
- Produces:
  - `pinLayout(n: number, zoom: number): { x: number; y: number }[] | 'collapsed'` — n ≥ 6、または zoom < `PIN_COLLAPSE_ZOOM` なら `'collapsed'`。それ以外は n 個、横に `PIN_GAP_PX` ずつ・中央に寄せ、真ん中ほど少し高い（y が小さい、端と中央の差 8px 程度）
  - `createBuildingPins(map, onTap: (shopIds: string[]) => void): { update(buildings: { placed: PlacedShop; shops: Shop[] }[], checked: ReadonlySet<string>): void; dispose(): void }`
  - ピンの色は `ShopSheet` の仮のバッジ色と同じ（`BADGE_COLOR` を `src/shops/domain/badgeColor.ts` に移して両方から使う）

- [ ] **Step 1:** `pins.test.ts`:
  - `3軒・ズーム17は3つで、中央が一番高い`（x は -34,0,34、y[1] < y[0]）
  - `ズーム15.9は collapsed` / `6軒はズーム19でも collapsed`
  - `buildingPins.test.ts`（jsdom、`maplibre-gl` の `Marker` は vi.mock）: `ピンを押すと onTap([その店の id])、まとめたピンは onTap(全員の id)`、`pointerdown は外に伝わらない（stopPropagation）`、`update を2回呼んでもマーカーは組の数だけ（古いものは remove）`、`済みの店のピンに ✓、まとめたピンに「1/3」`、`zoom 'zoomend' で並べ直す`
- [ ] **Step 2:** `npx vitest run src/shops/domain/pins.test.ts src/shops/infra/buildingPins.test.ts` → FAIL
- [ ] **Step 3:** 実装。マーカーはビルの位置に1つ（中に子要素のピンを並べる）、`offset: [0, -sizeM * BUILDING_PIN_OFFSET_PER_SIZE]`。ピンは丸＋下の三角（mock ①の形、仮）、済みは ✓ を重ねる。まとめたピンの数字は mock ②の札（例「1/3」）
- [ ] **Step 4:** 同じコマンド → PASS
- [ ] **Step 5:** commit `feat(shops): pins above multi-shop buildings`

### Task 5: 地図へのつなぎ（worldLayers）

**Files:**
- Modify: `src/map/ui/worldLayers.ts`, `src/map/ui/worldLayers.test.ts`

**Interfaces:**
- Consumes: `groupShops`、`placeShop(…, maxSizeM)`、`PlacedShop`（Task 3）、`createBuildingPins`（Task 4）
- Produces:
  - `Deps` に `onPinTap: (shopIds: string[]) => void`
  - `World.pick(point): string[] | null`
  - 店ごとの置き方の覚え（`placed`）は `{ main: Placement 済み PlacedShop; bldg: PlacedShop | null }`（`free` はやめる。同じ輪郭の店はビルにまとまるので要らない）

- [ ] **Step 1:** テストを直す・足す:
  - 既存 `同じ建物に2軒あれば、近い方が建物に合わせ、もう1軒は輪郭なしで置く` → `同じ建物に2軒あれば、ビル1つ（model 'building'・id 'bldg:a'・shopIds [a,b]）を建物の真ん中に置く`（大きさは輪郭 20×12 なので 14 のまま）
  - `組の片方が霧の中なら、見えている1軒はふつうの店`（Review Focus 1）
  - `ビルに入った済みの店には checkMarks を出さず、buildingPins に渡る`（Review Focus 2）
  - `pick はビルなら shopIds 全部を返す`
  - モックに `buildingPins.ts` を足す
- [ ] **Step 2:** `npx vitest run src/map/ui/worldLayers.test.ts` → FAIL
- [ ] **Step 3:** 実装。`refreshShops` の流れ: 見える店ごとに置き方（初回だけ計算、`pl.onFootprint` なら `bldg` も `placeShop(roads, footprints, BUILDING_MAX_SIZE_M)` で）→ `groupShops(見える店.map(s => ({ id, footprintCenter: bldg ? frame.to(main) : null })))` → 1軒の組は今どおり、2軒以上はビル。`checkMarks` には1軒の店だけ、`buildingPins` にはビルだけ渡す。`shownKey` に組の形も入れる。`markChecked` と `loadProgress` のあとはピンも更新。`dispose` でピンも消す
- [ ] **Step 4:** `npx vitest run src/map/ui` → PASS
- [ ] **Step 5:** commit `feat(map): show multi-shop buildings`

### Task 6: ビルの一覧のシートと画面のつなぎ

**Files:**
- Create: `src/checkin/ui/BuildingSheet.tsx`, `src/checkin/ui/BuildingSheet.test.tsx`
- Modify: `src/map/ui/MapView.tsx`, `src/routes/MapPage.tsx`, `src/routes/MapPage.test.tsx`, `src/checkin/ui/checkin.css`

**Interfaces:**
- Produces:
  - `BuildingSheet({ shops: Shop[]; checkedIds: ReadonlySet<string>; onPick(shop: Shop): void; onClose(): void })`
  - `MapView` の props に `onSelectBuilding: (shops: Shop[] | null) => void`、`MapViewHandle` に `checked(): ReadonlySet<string>`
  - `MapView` のタップと `onPinTap` は同じ処理 `handleTap(ids: string[] | null)`: 1件 → `onSelectShop`、2件以上 → `onSelectBuilding`（カメラは先頭の店へ寄せる、今のお店と同じ動き）

- [ ] **Step 1:** `BuildingSheet.test.tsx`:
  - `見出しは「このビルのお店」と「済み 1/3」`
  - `名前の順（日本語の並び、localeCompare('ja')）に並ぶ`
  - `済みの店の行に ✓`
  - `行を押すと onPick(その店)、閉じるで onClose`
  - `MapPage.test.tsx`: `一覧で店を選ぶと、一覧が閉じてお店のシートが出る`（Review Focus 4。MapView はモック済みの形に合わせて `onSelectBuilding` を呼ぶ）
- [ ] **Step 2:** `npx vitest run src/checkin src/routes` → FAIL
- [ ] **Step 3:** 実装。見た目は `ShopSheet` と同じ下からのシート（`.shop-sheet` の形を流用、行は種類の色の丸＋店名＋✓）
- [ ] **Step 4:** `npm test` と `npx tsc -b` と `npm run lint` → すべて PASS
- [ ] **Step 5:** commit `feat(checkin): building shop list sheet`

### Task 7: 確認と記録

- [ ] **Step 1:** `npm run build` → 成功
- [ ] **Step 2:** 画面を撮る（`session-handoff.md` の Playwright の手順、`?fake` で東京駅の近く）。ビル・ピン・縮小時の「1/3」・一覧を撮り、PNG で本人に送る。ずらし幅などの調整値を直す
- [ ] **Step 3:** 本人の実機確認（dev へ反映: `session-handoff.md` の merge-tree の手順。`git push` は単独で）
- [ ] **Step 4:** 記録: `CLAUDE.md` の現状の節（ビル）、`docs/session-handoff.md`（次は大きい施設）、`docs/learning-log.md`、`handoff/to-claude/2026-11-07-building-and-other-shop.md` を完了に＋`handoff/LOG.md` に1行、設計書 §13 に「2〜5軒は実装済み」
- [ ] **Step 5:** commit `docs: multi-shop building done`
