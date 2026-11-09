# お店のシート（2段・写真シール＋自分の記録） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** お店のシートを「① 小さい段 ⇄ ② 全画面」の2段にし、写真シール（無い店は種類の模型の絵）と「わたしの記録」（回数・はじめて・この前・枠の段）を出す。

**Architecture:** 記録は起動時に読んでいる `checkins` の行（`loadProgress`）から店ごとの `Visits` を作り、地図（`worldLayers`）が持つ。シートを開くとき `MapViewHandle.visitsFor(shop)` で聞く。写真は Edge Function が既に返す `photo_url` を `ShopDetails.photoUrl` に通す。ホットペッパーのページは店 ID から作る。

**Tech Stack:** React 19 / TypeScript / Vitest / CSS

**Spec:** `docs/superpowers/specs/2026-11-09-shop-sheet-design.md`（ラフ `art/reference/ui/shop-sheet-D.png`）

## Global Constraints
- 枠: 1〜2回 `normal`／3〜9回 `silver`／10回〜 `gold`。
- 日付は日本時間（`src/checkin/domain/day.ts` の `jstDay`）。表示は「2026.11.3 はじめて」（シール）、「11/3」（記録の欄）。
- ホットペッパーのページ: `https://www.hotpepper.jp/str<ID>/`（id が `hp:` ＋英数字のときだけ）。新しいタブ（`target="_blank" rel="noopener noreferrer"`）。
- 写真の URL は `https://` で始まるものだけ使う。
- 伏せている気配の店: 写真・店名・ひと言・ホットペッパーの欄を出さない。シールは mystery の絵。
- サーバー・DB は変えない。clean architecture（domain は何も import しない）。

## Review Focus
1. 合体した店（`hp:` ＋ `mapId` の `osm:`）: 2つの id の記録を合わせて数える（片方だけだと回数が減る）。→ Task 1 のテスト。
2. 記録がまだ読めていない／読めなかった: 記録の欄を出さず、シートは普通に出る。→ Task 3 のテスト。
3. 写真の URL が `http:` や変な文字列: 写真を出さず模型の絵にする。→ Task 2 のテスト。
4. 気配の店を伏せている間に全画面にしても正体が出ない。→ Task 3 のテスト。
5. チェックインの直後に同じ店を開き直すと回数が1つ増えている。→ Task 1（`addVisit`）と worldLayers の `checkin`。

---

### Task 1: 店ごとの記録（Visits）

**Files:**
- Create: `src/checkin/domain/visits.ts`, `src/checkin/domain/visits.test.ts`
- Modify: `src/checkin/infra/checkinApi.ts`（`loadProgress` が `visitsByShop` を返す。`lastDayByShop` は消す）, `src/map/ui/worldLayers.ts`（`lastDay` を `visits` に置きかえ、`checkin` で `addVisit`、`visitsFor` を足す）, `src/map/ui/MapView.tsx`（handle に `visitsFor`）, 関係するテスト

**Interfaces:**
- Produces:
  - `type Visits = { count: number; firstDay: string; lastDay: string }`（日は `YYYY-MM-DD`）
  - `summarizeVisits(rows: { shop_id: string; checked_in_at: string }[]): Map<string, Visits>`
  - `addVisit(v: Visits | undefined, day: string): Visits`
  - `mergeVisits(a: Visits | undefined, b: Visits | undefined): Visits | null`
  - `type FrameTier = 'normal' | 'silver' | 'gold'`; `frameTier(count: number): FrameTier`
  - `nextTier(count: number): { tier: FrameTier; remaining: number } | null`（金なら null）
  - `MapViewHandle.visitsFor(shop: Shop): Visits | null`（読み込み前・0回は null）

- [ ] Step 1: テストを書く — `summarizeVisits` で同じ店2行 → `{count:2, firstDay:'2026-11-03', lastDay:'2026-11-08'}`（UTC 15:30 の行は翌日の JST になる）／`mergeVisits` は回数の和・最初は小さい方・最後は大きい方、両方 undefined は null／`frameTier(2)='normal'`, `(3)='silver'`, `(9)='silver'`, `(10)='gold'`／`nextTier(2)={tier:'silver',remaining:1}`, `nextTier(5)={tier:'gold',remaining:5}`, `nextTier(10)=null`／`addVisit(undefined,'2026-11-09')` は count 1。
- [ ] Step 2: `npx vitest run src/checkin/domain/visits.test.ts` → FAIL
- [ ] Step 3: 実装。`loadProgress` と worldLayers・MapView をつなぐ（`checkedToday` は `visits` の `lastDay` で判定する）。
- [ ] Step 4: `npm test` と `npx tsc -b` → PASS
- [ ] Step 5: Commit `feat(checkin): per-shop visit record`

### Task 2: 写真・ホットペッパーのリンク・種類の絵

**Files:**
- Modify: `src/shops/domain/shop.ts`（`ShopDetails.photoUrl: string | null`）, `src/shops/infra/hotpepper.ts`（`photo_url` を `https://` のときだけ通す）, 関係するテスト
- Create: `src/shops/domain/hotpepperLink.ts` ＋テスト, `src/assets/shops/cards/<種類>.webp`（`art/reference/shops/<種類>.webp` 18枚を幅 360px の webp に縮める。ffmpeg）

**Interfaces:**
- Produces: `hotpepperPageUrl(shopId: string): string | null`（`/^hp:([A-Za-z0-9]+)$/` 以外は null）; `ShopDetails.photoUrl`

- [ ] Step 1: テスト — `hotpepperPageUrl('hp:J001234567')='https://www.hotpepper.jp/strJ001234567/'`、`'osm:123'`・`'hp:J1/../x'` は null／hotpepper の変換で `photo_url:'https://x/l.jpg'` → `photoUrl` そのまま、`'http://x'` と数値は null。
- [ ] Step 2: FAIL を確かめる → 実装 → `npm test`・`npx tsc -b` PASS
- [ ] Step 3: Commit `feat(shops): photo url, hotpepper page link, card images`

### Task 3: 2段のシート

**Files:**
- Modify: `src/checkin/ui/ShopSheet.tsx`, `src/checkin/ui/ShopSheet.test.tsx`, `src/checkin/ui/checkin.css`, `src/routes/MapPage.tsx`（開くとき `visitsFor` を聞いて渡す）

**Interfaces:**
- Consumes: Task 1 の `Visits`・`frameTier`・`nextTier`、Task 2 の `photoUrl`・`hotpepperPageUrl`
- Produces: `ShopSheet` の新しい prop `visits?: Visits | null`

決めたこと: 段は ShopSheet の中の state（`expanded`）。持ち手（`.shop-sheet__grab`）と全体で pointer の上下 40px 以上で切りかえ（上で全画面、全画面で下なら小さく、小さい段で下なら閉じる）。持ち手のタップでも切りかえ（ボタンにして `aria-label="くわしく見る"`／`"小さくする"`）。全画面は `.shop-sheet--full`（上まで、中はスクロール）。他のシートが開く・店が替わると小さい段に戻る（`key={shop.id}`）。

- [ ] Step 1: テスト — 小さい段: 店名・「2回行った」（visits.count 2）が出る、0回/null では出ない／持ち手を押すと全画面: 「わたしの記録」「11/3」「はじめて」「あと1回で銀の枠」、「ホットペッパーで見る」のリンクの href／visits null の全画面は記録の欄なし／地図だけの店: 「くわしい情報はまだありません」、ホットペッパーのリンク無し／伏せた店の全画面: 店名・ひと言・写真・リンクが出ない／写真あり: `img` の src が photoUrl。
- [ ] Step 2: FAIL → 実装（ラフ D の配置。仮の見た目は CSS、ミシェーラの素材が来たら差しかえ）→ `npm test`・`npx tsc -b`・`npm run lint` PASS
- [ ] Step 3: 確認ページで撮って見る（`.superpowers/preview/` の ck.html。小さい段・全画面・地図だけの店）
- [ ] Step 4: Commit `feat(checkin): two-step shop sheet with photo sticker and my record`

### 終わり
- [ ] テスト役（tester）に、設計メモとの一致・伏せ・URL の扱いを読んでもらう
- [ ] 引き継ぎメモ・CLAUDE.md の現状を更新し、dev に反映
