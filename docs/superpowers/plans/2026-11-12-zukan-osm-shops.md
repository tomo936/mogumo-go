# 図鑑に地図のデータだけのお店を出す 実装計画

> 実行: superpowers:executing-plans（リーダーが直接）。

**Goal:** 晴れた場所の地図のお店（`osm:`）を `shops` に入れ、図鑑に「？」として出す。あわせて、晴れた場所・ジャンル・2 枚になる、のずれを直す。
**Spec:** `docs/superpowers/specs/2026-11-12-zukan-osm-shops-design.md`

## Global Constraints
- 関数 `shops-osm` が受け取るのは `{ tiles: {x,y}[] }`（ズーム 14、整数、0 ≤ x,y < 2^14、1〜9 枚）だけ。違えば 400。
- 飲食店 = subclass が restaurant・cafe・fast_food・bar・pub・bakery・confectionery・ice_cream、かつ名前（空白だけでない）、かつ点。id は `osm:<番号>`。
- upsert する列は `shop_id, name, lat, lng, genre_name(=subclass), fetched_at` だけ（チェックインの関数と同じ）。
- 同じタイルは端末から 7 日に 1 回。1 回に 9 枚まで。位置・タイルはログに出さない。
- 依存の向き ui → infra → domain。import に拡張子、型は `import type`。

## Review Focus
1. 霧の中の行っていないお店が図鑑に出ないこと（晴れたマスの外の `osm:` は出さない）。
2. 関数が作り物の id・名前を受け取らないこと（受け取るのはタイル番号だけ）。
3. 関数が失敗してもアプリが止まらず、次の機会に送り直すこと（失敗したタイルは「送った」にしない）。
4. ホットペッパーの店と地図の店が 1 枚にまとまり、行った回数が合わさること。

### Task 1: サーバーの関数 `shops-osm`
- Create: `supabase/functions/shops-osm/core.ts`（`parseTiles(body): {x,y}[] | null`、`FOOD`、`rowsFromPois(pois, nowIso): ShopRow[]`、`TILE_Z = 14`、`MAX_TILES = 9`）、`osmTile.ts`（`readTilePois(tiles)`）、`index.ts`
- Test: `supabase/functions/shops-osm/core.test.ts`
  - parseTiles: 正しい 2 枚 → 2 枚。0 枚・10 枚・小数・範囲外・形違い → null。重複は 1 枚に。
  - rowsFromPois: 飲食でない・名前なし・id なしは捨てる。id の重複は 1 行。列は 6 つ。
  - FOOD は checkin/core.ts と src/shops/infra/mapShops.ts の FOOD と同じ（ファイルの文字で比べる）。
- Commit `shops-osm: function that stores food POIs of given map tiles`

### Task 2: アプリの送り手
- Create: `src/zukan/domain/osmTiles.ts`（`tilesOfClearedShops(shops, cleared, z=14): {x,y}[]`、`dueTiles(tiles, sent: Record<string,string>, today, days=7, max=9)`）、`src/zukan/infra/osmSync.ts`（`syncOsmShops(userId, shops, cleared, opts?)`：送る → 成功したタイルだけ送った日を記録）
- Test: `osmTiles.test.ts`（晴れたマスの外・`hp:` は使わない、7 日、9 枚まで）、`osmSync.test.ts`（成功で記録、失敗で記録しない、送る物が無ければ呼ばない）
- Commit `zukan: send cleared map-shop tiles to shops-osm`

### Task 3: 図鑑の読み込みと画面
- Modify: `src/zukan/infra/zukanApi.ts`（`osm:` は `kindFromMap(genre_name ?? '', name)`、`mergeShops` で地図の店をホットペッパーの店にまとめ `mapId` を付ける、引数 `opts?: { mapShops?: Shop[]; cleared?: ReadonlySet<string> }`：地図の店を足し、晴れたマスを合わせる）、`src/zukan/ui/Zukan.tsx`（`mapShops`・`cleared` を受け取り `loadZukan` に渡す）、`src/routes/MapPage.tsx`（霧が晴れたとき・お店がそろったとき・図鑑を開いたときに `syncOsmShops`、図鑑に地図のお店と晴れたマスを渡す）
- Test: `zukanApi.test.ts`（osm のジャンル、まとめて回数が合う、地図の店が足される、晴れたマスで cleared）
- Commit `zukan: include map shops, device cleared cells, same genre and merge as the map`

### Task 4: 置き方の手順と文書
- Create: `docs/superpowers/plans/2026-11-12-zukan-osm-shops-deploy.md`。Modify: `CLAUDE.md`、`docs/session-handoff.md`
- `npm test`・`npx tsc -b`・`npm run lint`・`npm run build` を通してコミット。
