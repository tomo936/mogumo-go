# 地図表示・傾け・現在地追従（ステップ3a）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログイン後の `/` を、自分が常に中心の 55°傾けた MapLibre 地図にし、GPS を毎コマなめらかに追従させる。

**Architecture:** 位置のならし・判定・状態遷移は React 外の純粋関数（`src/map/*.ts`）にしてテストする。`MapView` が MapLibre インスタンスと requestAnimationFrame のループを ref で持ち、カメラは毎コマ `jumpTo`。React に上がるのは位置情報の「状態の切り替わり」だけ。

**Tech Stack:** maplibre-gl 6.x / OpenFreeMap / React 19 / Vitest

**Spec:** `docs/superpowers/specs/2026-11-05-map-follow-design.md`

## Global Constraints

- 作業ブランチ `cycle1-map`（main から作る）
- CLAUDE.md のツールチェーン規則（import type、拡張子付き import、enum 不可、noUnused*）。npm は `--cache "$TMPDIR/npm-cache"`
- 値はすべて `src/map/config.ts` に集める: `STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'`、`PITCH = 55`、`MIN_ZOOM = 16`、`MAX_ZOOM = 18`、`INITIAL_ZOOM = 17`、`CIRCLE_RADIUS_M = 50`、`MAX_ACCURACY_M = 50`、`MAX_SPEED_MPS = 30`、`SNAP_GAP_MS = 10000`、`FOLLOW_TAU_MS = 400`、`FIRST_FIX_TIMEOUT_MS = 20000`、`ROTATE_DEG_PER_PX = 0.3`
- 位置情報をサーバー・外部へ送らない。開発用の「歩いたふり」の起点は東京駅（35.6812, 139.7671）。自宅周辺の座標をコードに書かない
- 画像素材は使わない（影・サークルは図形）
- 文言（そのまま使う）:
  - 探索中: 「現在地を探しています…」
  - 途切れ（小さな帯）: 「位置情報を待っています…」
  - 拒否: 見出し「位置情報がオフになっています」、本文「iPhone の『設定』→『プライバシーとセキュリティ』→『位置情報サービス』→『Safari の Web サイト』で『使用中のみ』にしてから、このページを再読み込みしてください」、ボタン「再読み込み」
  - 見つからない: 見出し「現在地が見つかりません」、ボタン「もう一度試す」
- 各タスクの終わりに `npm test`・`npm run build`・`npx oxlint src` が通ること

## Review Focus

1. **アプリを裏に回して戻る**と rAF の経過時間が巨大になる → `stepToward` は大きな dt で目標そのものを返し、行き過ぎない（Task 1 のテスト）
2. **飛びを捨て続けて本物の位置に戻れない** → 最後に受け入れた測位から `SNAP_GAP_MS` 以上たてば、速さに関係なく `snap`（Task 1 のテスト）
3. **StrictMode の二重マウント**で GPS の監視や地図が2つ残る → `watchLocation` の解除で `clearWatch` が呼ばれる（Task 2 のテスト）。`MapView` は cleanup で `map.remove()` と rAF 停止
4. **iPhone で地図をなぞるとページごとスクロール・バウンス**する → 地図の器に `touch-action: none`、全画面 `100svh`（Task 3、実機確認）
5. **歩いている途中の一時的な失敗で全画面エラーになる** → 測位済みなら `timeout`/`unavailable` は `waiting`（帯）止まり。`denied` だけは常に全画面（Task 2 のテスト）

---

### Task 1: 位置の計算（距離・円・ならし・測位の判定）

**Files:**
- Create: `src/map/config.ts`、`src/map/geo.ts`、`src/map/geo.test.ts`、`src/map/smoothing.ts`、`src/map/smoothing.test.ts`
- 事前: `git switch -c cycle1-map`、`npm install maplibre-gl`

**Interfaces:**
- Produces:
  - `geo.ts`: `export type LatLng = { lat: number; lng: number }`、`distanceMeters(a: LatLng, b: LatLng): number`（ハバーサイン）、`circlePolygon(center: LatLng, radiusM: number, steps?: number): GeoJSON.Polygon`（既定 64 点、閉じた輪）
  - `smoothing.ts`: `export type Fix = { lat: number; lng: number; accuracy: number; time: number }`、`judgeFix(fix: Fix, last: Fix | null): 'accept' | 'reject' | 'snap'`、`stepToward(current: LatLng, target: LatLng, dtMs: number): LatLng`

- [ ] **Step 1: 失敗するテストを書く**
  - `distanceMeters` 東京駅→同じ点で 0、緯度 0.001 度差でおよそ 111m（±1m）
  - `circlePolygon(c, 50)` の全頂点が中心から 50m（±0.5m）、最初と最後の点が同じ
  - `judgeFix`: `last` が null → `'snap'`／accuracy 51 → `'reject'`／1秒後に 10m 先 → `'accept'`／1秒後に 100m 先（100m/s）→ `'reject'`／`SNAP_GAP_MS` 後に 2km 先 → `'snap'`
  - `stepToward`: dt=0 で current のまま／dt=`FOLLOW_TAU_MS` で距離が約 63% 縮む（1-e⁻¹、±2%）／dt=600000 で target と一致（行き過ぎない）
- [ ] **Step 2:** `npm test` → FAIL（モジュールが無い）
- [ ] **Step 3:** 実装。`stepToward` は k = 1 − exp(−dt/FOLLOW_TAU_MS) で緯度経度を線形補間。`judgeFix` の順序は「accuracy 超過→reject」「last 無し or 経過 ≥ SNAP_GAP_MS → snap」「速さ > MAX_SPEED_MPS → reject」「それ以外 accept」
- [ ] **Step 4:** `npm test`・`npm run build`・`npx oxlint src` → PASS
- [ ] **Step 5:** コミット `feat(map): add geo and smoothing helpers`

### Task 2: 位置情報の受け取りと状態

**Files:**
- Create: `src/map/location.ts`、`src/map/location.test.ts`、`src/map/locationStatus.ts`、`src/map/locationStatus.test.ts`、`src/map/LocationOverlay.tsx`、`src/map/LocationOverlay.test.tsx`、`src/map/fakeWalk.ts`、`src/map/fakeWalk.test.ts`

**Interfaces:**
- Consumes: Task 1 の `Fix`、`LatLng`
- Produces:
  - `location.ts`: `export type GeoFailure = 'denied' | 'unavailable' | 'timeout'`、`watchLocation(onFix: (fix: Fix) => void, onError: (failure: GeoFailure) => void, geo?: Geolocation): () => void`（`enableHighAccuracy: true, maximumAge: 0, timeout: 15000`。コード 1/2/3 → denied/unavailable/timeout）
  - `locationStatus.ts`: `export type LocationStatus = 'searching' | 'tracking' | 'waiting' | 'denied' | 'notFound'`、`export type LocationEvent = { type: 'fix' } | { type: 'failure'; failure: GeoFailure } | { type: 'firstFixTimeout' } | { type: 'retry' }`、`nextStatus(status: LocationStatus, event: LocationEvent): LocationStatus`
  - `LocationOverlay.tsx`: `LocationOverlay({ status, onRetry, onReload }: { status: LocationStatus; onRetry: () => void; onReload: () => void })`
  - `fakeWalk.ts`: `startFakeWalk(onFix: (fix: Fix) => void, start?: LatLng, now?: () => number): () => void`（1秒ごとに 1.4m/s で起点のまわりの四角い道を歩く。既定の起点は東京駅）、`isFakeWalkEnabled(search: string, dev: boolean): boolean`（dev かつ `fake` パラメータがあるときだけ true）

- [ ] **Step 1: 失敗するテストを書く**
  - `nextStatus`: searching+fix→tracking／tracking+failure(timeout)→waiting／waiting+fix→tracking／tracking+failure(unavailable)→waiting／任意+failure(denied)→denied／searching+failure(timeout)→searching／searching+firstFixTimeout→notFound／tracking+firstFixTimeout→tracking／notFound+retry→searching／denied+retry→denied
  - `watchLocation`: 偽の `Geolocation` で成功コールバックが `Fix`（`time` は position.timestamp）になる／エラーコード 1・2・3 の変換／返り値を呼ぶと `clearWatch` が同じ id で呼ばれる
  - `LocationOverlay`: searching で「現在地を探しています…」／waiting で「位置情報を待っています…」／denied で見出し・本文・「再読み込み」（押すと onReload）／notFound で見出し・「もう一度試す」（押すと onRetry）／tracking で何も出さない
  - `fakeWalk`: `vi.useFakeTimers()` で3秒進めると onFix が3回、隣り合う点の距離が約 1.4m（±0.2m）、停止関数のあとは呼ばれない／`isFakeWalkEnabled('?fake', true)` true、`('?fake', false)` false、`('', true)` false
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装。`nextStatus` は同じ状態なら同じ値を返す（React の再描画を起こさない）
- [ ] **Step 4:** `npm test`・`npm run build`・`npx oxlint src` → PASS
- [ ] **Step 5:** コミット `feat(map): add location watching, status and fake walk`

### Task 3: 地図の画面

**Files:**
- Create: `src/map/rotate.ts`、`src/map/rotate.test.ts`、`src/map/MapView.tsx`、`src/map/map.css`
- Modify: `src/routes/MapPage.tsx`（地図＋重ね表示＋ログアウトボタン）、`src/routes/routes.test.tsx`（`../map/MapView.tsx` を `vi.mock` し、「地図（準備中）」の確認を `data-testid="map-view"` の存在に置き換える）

**Interfaces:**
- Consumes: Task 1・2 のすべて
- Produces:
  - `rotate.ts`: `nextBearing(bearing: number, dxPx: number): number`（`ROTATE_DEG_PER_PX` を掛けて加算、0〜360 に正規化）
  - `MapView.tsx`: `MapView({ onStatus }: { onStatus: (event: LocationEvent) => void })`。器は `<div data-testid="map-view" className="map-view">`

- [ ] **Step 1: 失敗するテストを書く**
  - `nextBearing(350, 100)` → 20／`nextBearing(10, -100)` → 340／`nextBearing(0, 0)` → 0
  - `routes.test.tsx`: ログイン済みで `/` → `map-view` があり「ログアウト」ボタンがある（既存のログアウトのテストはそのまま通ること）
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装
  - `MapView`: マウント時に `new maplibregl.Map({ style: STYLE_URL, pitch: PITCH, zoom: INITIAL_ZOOM, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, dragPan: false, dragRotate: false, keyboard: false, doubleClickZoom: false, scrollZoom: { around: 'center' }, attributionControl: { compact: false } })`、`touchZoomRotate` は `{ around: 'center' }` で有効化し `disableRotation()`、`pitchWithRotate: false`
  - 1本指の横なぞり（pointer イベント、指が1本のときだけ）で `map.setBearing(nextBearing(...))`
  - 位置: `watchLocation`（`isFakeWalkEnabled(location.search, import.meta.env.DEV)` なら `startFakeWalk`）→ `judgeFix` で target 更新（snap なら表示位置も即時に target）→ `onStatus({ type: 'fix' })`。失敗は `onStatus({ type: 'failure', failure })`。最初の測位が `FIRST_FIX_TIMEOUT_MS` 内に無ければ `onStatus({ type: 'firstFixTimeout' })`
  - rAF ループ: `stepToward` → `map.jumpTo({ center })` → 検知サークル（`circlePolygon(center, CIRCLE_RADIUS_M)` の fill＋line レイヤー、水色の半透明）と影（中心の小さな楕円、灰色の半透明）の GeoJSON source を更新。最初の測位までは地図を出さない（`visibility: hidden`）
  - cleanup: rAF 停止、監視解除、`map.remove()`
  - `map.css`: `.map-view { position: fixed; inset: 0; height: 100svh; touch-action: none; }`。重ね表示とログアウトボタンは地図の上に絶対配置
  - `MapPage`: `useReducer(nextStatus, 'searching')`。`LocationOverlay` の onRetry で `retry` を送り `MapView` を `key` で作り直す、onReload で `window.location.reload()`
- [ ] **Step 4:** `npm test`・`npm run build`・`npx oxlint src` → PASS
- [ ] **Step 5: 手動確認（本人）**
  - PC: `npm run dev` → `http://localhost:5173/?fake` で、地図が傾き、四角い道をなめらかに進み、なぞると回る
  - iPhone（main 取り込み後の本番 URL。プレビュー URL は許可リストに無くログインできない）: 外を少し歩いてカクつかない／ピンチでズーム／ページがスクロールしない／出典が表示されている／位置情報を「許可しない」にすると案内が出る
- [ ] **Step 6:** コミット `feat(map): show tilted map that follows the current location`

### Task 4: 記録

**Files:**
- Modify: `CLAUDE.md`（現状の節：地図は `src/map/`、追従の仕組み）、`docs/learning-log.md`（6件目。本人の感想欄は空けておく）

- [ ] **Step 1:** 追記して `npm test` が通ることを確認し、コミット `docs: record map follow step`
