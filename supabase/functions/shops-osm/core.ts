// shops-osm の決まり（Deno でも Node のテストでも動く純粋な関数）。
// 設計: docs/superpowers/specs/2026-11-12-zukan-osm-shops-design.md

export const TILE_Z = 14
export const MAX_TILES = 9
const TILE_MAX = 2 ** TILE_Z

// 飲食店の種類。src/shops/infra/mapShops.ts・supabase/functions/checkin/core.ts の FOOD と同じにしておくこと（keep in sync。テストで確かめる）
export const FOOD = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bakery', 'confectionery', 'ice_cream'])

export type Tile = { x: number; y: number }
export type PoiFeature = { id: number | string | undefined; name?: string; subclass?: string; lat: number; lng: number }
export type ShopRow = { shop_id: string; name: string; lat: number; lng: number; genre_name: string; fetched_at: string }

const isTileNum = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < TILE_MAX

// 受け取るのは { tiles: [{x,y}, ...] }（1〜9 枚）だけ。違えば null（400）
export function parseTiles(body: unknown): Tile[] | null {
  if (typeof body !== 'object' || body === null) return null
  const tiles = (body as { tiles?: unknown }).tiles
  if (!Array.isArray(tiles) || tiles.length === 0 || tiles.length > MAX_TILES) return null
  const out: Tile[] = []
  const seen = new Set<string>()
  for (const t of tiles) {
    if (typeof t !== 'object' || t === null) return null
    const { x, y } = t as { x?: unknown; y?: unknown }
    if (!isTileNum(x) || !isTileNum(y)) return null
    const k = `${x}/${y}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ x, y })
  }
  return out
}

// タイルの点から shops の行を作る（飲食店・名前あり・id あり。同じ id は 1 行）
export function rowsFromPois(pois: readonly PoiFeature[], nowIso: string): ShopRow[] {
  const out: ShopRow[] = []
  const seen = new Set<string>()
  for (const p of pois) {
    if (p.id === undefined || typeof p.subclass !== 'string' || !FOOD.has(p.subclass)) continue
    if (typeof p.name !== 'string' || p.name.trim() === '') continue
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    const shopId = `osm:${p.id}`
    if (seen.has(shopId)) continue
    seen.add(shopId)
    out.push({ shop_id: shopId, name: p.name, lat: p.lat, lng: p.lng, genre_name: p.subclass, fetched_at: nowIso })
  }
  return out
}
