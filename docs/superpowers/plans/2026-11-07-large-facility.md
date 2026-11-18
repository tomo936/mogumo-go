# 大型施設（実際の形の立体）と駅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 2,500m² 以上・2軒以上の建物を、地図の輪郭を立ち上げたかわいい立体で出し、拡大でピンを屋根の上に散らばらせる。駅の点があれば駅舎を添える。

**Architecture:** 置き方の計算（`placeShop`）が選んだ輪郭の番号を返し、`worldLayers` が大型の組についてだけ、その輪郭と重なる輪郭（タイルのかけら・高さ違いの部分）を集めて `facilityLayer`（three の押し出し）に渡す。ピンは `buildingPins` に「屋根の高さ」と「散らばりモード」を足す。駅はタイルの poi 層の鉄道駅の点で判定する。

**Tech Stack:** three.js（ExtrudeGeometry・CanvasTexture）/ MapLibre / Vitest / Blender 4.2

**Spec:** `docs/superpowers/specs/2026-11-07-large-facility-design.md`

## Global Constraints
- CLAUDE.md の書き方（`import type`・拡張子・enum なし・未使用で落ちる）。domain は three・MapLibre・ブラウザを import しない。`config.ts` は何も import しない。
- チェックインは変えない（お店の点から 50m）。サーバーは触らない。
- 色は見本どおり: 壁 `#f6ead7`、窓 `#91cfe7`、木のふち `#8e5c42`（明るい木 `#b7a08a`）、ひさしの赤 `#e4745f`＋白。
- 新しい調整値（`src/shops/config.ts`）: `FACILITY_HEIGHT_RATE = 0.5`、`FACILITY_MIN_H_M = 6`、`FACILITY_MAX_H_M = 30`、`FACILITY_FLOOR_M = 3.5`、`FACILITY_SCATTER_ZOOM = 17.5`、`FACILITY_CLUSTER_PX = 22`、`FACILITY_NEAR_M = 200`、`STATION_SIZE_M = 12`。

## Review Focus
1. 施設の店が霧で一部しか見えない → 見えている店だけで組を作る（前の段と同じ）。施設の立体は2軒以上見えているときだけ。Task 6。
2. 重なった輪郭（タイルのかけら・伊勢丹の高さ違い）で屋根がちらつかない（同じ高さの部分は少しずつ高さをずらす）。Task 2。
3. 散らばったピンと地図のタップが二重に走らない（ピンの pointerdown を止める、前の段と同じ）。Task 5。
4. 縮小⇔拡大でマーカーが残り続けない。Task 5。
5. 駅の点が地下鉄（subway）のときは駅にしない。Task 1。

---

### Task 1: 地図データから高さと駅の点を取り出す・選んだ輪郭の番号

**Files:** Modify `src/shops/infra/mapFeatures.ts`・`.test.ts`、`src/shops/domain/placement.ts`・`.test.ts`

**Interfaces (Produces):**
- `AreaFeatures = { roads; footprints: (Item & { z: number; h: number })[]; stations: P[] }` — `h` はタイルの `render_height`（無ければ 10）。`stations` は poi 層の `class === 'railway' && subclass !== 'subway'` の点（m）
- `featuresNear(all, at, rangeM?) → { roads: P[][]; footprints: P[][]; heights: number[]; stations: P[] }` — heights は footprints と同じ並び。stations は at からの m、rangeM 以内
- `Placement` に `ringIndex: number | null`（選んだ輪郭の footprints の番号。輪郭なしは null）

- [ ] テスト: `render_height を heights に、無ければ 10`／`poi の railway/station は stations に入り、subway は入らない`／`placeShop は選んだ輪郭の番号を返す（大きい方の 1）、輪郭なしは null`
- [ ] 実装 → `npx vitest run src/shops` PASS → commit `feat(shops): heights, station points and chosen outline index`

### Task 2: 施設の形の計算（domain）

**Files:** Create `src/shops/domain/facility.ts`・`.test.ts`

**Interfaces (Produces):**
- `cuteHeight(h: number): number` = clamp(h × 0.5, 6, 30)
- `facilityParts(mainIndex: number, rings: P[][], heights: number[]): { pts: P[]; heightM: number }[]` — main と、main と形が重なる（頂点が中にある・辺が交わる）輪郭だけ。高さは `cuteHeight`。同じ高さになった部分は、2つ目から 0.05m ずつ足す（屋根のちらつき対策）。最初が main
- `floors(heightM: number): number` = max(1, round(heightM / 3.5))
- `stationIn(parts, stations: P[]): P | null` — どれかの部分の中にある最初の駅の点

- [ ] テスト: `重なる輪郭は入り、離れた輪郭は入らない`／`高さは 0.5 倍で 6〜30 に収まる`／`同じ高さの2枚は 0.05m ずれる`／`floors(10)=3`／`駅の点が部分の中なら返し、外なら null`
- [ ] 実装 → PASS → commit `feat(shops): facility shape parts`

### Task 3: 仮の駅舎の模型

※ 取り下げ。`station.glb` は削除済み（2026-11-07）。

**Files:** Modify `art/prototypes/blender-shops.py`（`KIND=station`）、Create `src/assets/shops/station.glb`、Modify `src/assets/assets.test.ts`（13種＋building＋station）

- [ ] 駅舎: クリーム壁・赤茶の三角屋根・正面の丸い時計・改札の入口のひさし・横にホームの屋根少し。正面は -Y。`LIGHT=1 TARGET=7000` で書き出す
- [ ] テスト更新 → `npx vitest run src/assets` PASS → commit `art: placeholder station model`

### Task 4: 施設の立体を描く層

**Files:** Create `src/shops/infra/facilityLayer.ts`・`facilityPick.test.ts`、`src/shops/infra/facilityPick.ts`

**Interfaces (Produces):**
- `PlacedFacility = { id: string; shopIds: string[]; parts: { ring: LatLng[]; heightM: number }[]; topM: number; facingDeg: number; door: LatLng }`
- `createFacilityLayer(): CustomLayerInterface & { setFacilities(list: PlacedFacility[]): void; pick(point): string[] | null }`
- `pickFacility(list, tap, project, upPx: (f) => number): PlacedFacility | null` — 地面の輪郭か、屋根（地面の輪郭を upPx 上にずらしたもの）の中を押したら当たり

- [ ] テスト（`facilityPick.test.ts`）: `輪郭の中を押すと当たり、外は null`／`屋根の高さの所（地面より上）を押しても当たり`
- [ ] 実装: 部分ごとに `THREE.Shape`→`ExtrudeGeometry`（depth = heightM、bevel なし）。横の面は CanvasTexture（クリームの壁に、階ごとの窓の帯 `#91cfe7` と木の枠）を `wrapS/T = Repeat`、1階 3.5m・窓 2.5m おきになるよう repeat。屋根の面は明るいクリーム。屋根のふちは各辺に木色の細い箱（幅 0.5m・高さ 0.5m）。入口（`door`、正面の辺の真ん中）に赤白しまのひさしの箱を1つ。屋根の真ん中が輪郭の中なら植木と室外機を1つずつ。光は `shopLayer` と同じ
- [ ] `npx vitest run src/shops` PASS、`npx tsc -b` → commit `feat(shops): facility layer extruding real outlines`

### Task 5: ピンの屋根の高さと、散らばるピン

**Files:** Modify `src/shops/domain/pins.ts`・`.test.ts`、`src/shops/infra/buildingPins.ts`・`.test.ts`、`src/checkin/ui/checkin.css`

**Interfaces (Produces):**
- `PinnedBuilding` に `topM: number`（ビル = sizeM×1.3、施設 = topM）と `spots: { id: string; x: number; y: number }[]`（施設の店の位置、placed からの m。ビルは []）
- `clusterSpots(spots, gapM): { ids: string[]; x: number; y: number }[]` — gapM 以内の店を1つの塊に（塊の位置は平均）
- 施設は zoom ≥ `FACILITY_SCATTER_ZOOM` で散らばりモード: 塊ごとにマーカー（1軒=その店のピン、2〜3軒=横に少しずらしたピン、4軒以上=「+N」の札、押すとその塊の id 全部）。gapM = `FACILITY_CLUSTER_PX` ÷ 1m あたりの px（zoomend で計算し直す）。縮小では今どおり1つ＋「済み/全部」

- [ ] テスト: `clusterSpots: 1m の2軒は1つ、30m 離れれば別`／`施設・ズーム18 は店ごとのマーカー、+N の札を押すと塊の id`／`ズーム17 に戻すと1つにまとまり、前のマーカーは消える`／`ピンの高さは topM を使う`
- [ ] 実装 → PASS → commit `feat(shops): scattered pins on facility roofs`

### Task 6: 地図へのつなぎ

**Files:** Modify `src/map/ui/worldLayers.ts`・`.test.ts`

- [ ] テスト（モックに `facilityLayer.ts` を足す）: `2,500m² 以上の2軒は facilityLayer に渡り、shopLayer には出ない`／`施設の中に駅の点があれば、shopLayer に model 'station' の飾りが出る`／`2,500m² 未満の建物に駅の点があり2軒以上なら model 'station'`／`pick は施設も見る（facilityLayer.pick を先に）`
- [ ] 実装: 置き方の覚えに `facility: { parts: {ring: LatLng[]; heightM}[]; station: LatLng | null } | null` と `stationInRing: boolean` を足す（初回だけ、`featuresNear(area, pt, FACILITY_NEAR_M)` で集める）。大型の組 → `PlacedFacility`（id `fac:<先頭>`、door は main の置き方の正面）。駅の飾りは `{ model: 'station', sizeM: STATION_SIZE_M }` を駅の点に、向きは施設の正面。ピンには topM と spots を渡す。施設の層は霧より上・お店の層の下に足す。`dispose` で外す
- [ ] `npm test`・`npx tsc -b`・`npm run lint` → commit `feat(map): show large facilities as real shapes`

### Task 7: 確認と記録
- [ ] `npm run build`。画面を撮る（新宿駅・東京駅・経堂・伊勢丹のあたり）。高さ・窓の帯・ふちを見て調整値を直す
- [ ] 見直し役（Sonnet）に全体を見てもらい、重要な指摘を直す
- [ ] dev に反映、本人の実機確認。`CLAUDE.md`・`session-handoff.md`・`learning-log.md`・`handoff/LOG.md` を更新
