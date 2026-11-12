// 晴れた場所の地図のお店を shops に入れてもらうため、関数 shops-osm に送るタイルを選ぶ（純粋な計算）。
// 設計: docs/superpowers/specs/2026-11-12-zukan-osm-shops-design.md
import { cellKey, cellOf } from '../../fog/domain/grid.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { Shop } from '../../shops/domain/shop.ts'

export const OSM_TILE_Z = 14 // supabase/functions/shops-osm/core.ts の TILE_Z と同じ
export const OSM_MAX_TILES = 9 // 同じく MAX_TILES
export const OSM_RESEND_DAYS = 7

export type Tile = { x: number; y: number }
export const tileKey = (t: Tile) => `${t.x}/${t.y}`

export function tileOf(p: LatLng, z = OSM_TILE_Z): Tile {
  const n = 2 ** z
  const latR = (p.lat * Math.PI) / 180
  return {
    x: Math.floor(((p.lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n),
  }
}

// 晴れたマスにある地図のお店（osm:）が載っているタイル（重複なし）
export function tilesOfClearedShops(shops: readonly Shop[], cleared: ReadonlySet<string>): Tile[] {
  const out = new Map<string, Tile>()
  for (const s of shops) {
    if (!s.id.startsWith('osm:') || !cleared.has(cellKey(cellOf(s)))) continue
    const t = tileOf(s)
    out.set(tileKey(t), t)
  }
  return [...out.values()]
}

const dayNum = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86400000

// 前に送ってから days 日たっていないタイルは除き、max 枚まで
export function dueTiles(tiles: readonly Tile[], sent: Readonly<Record<string, string>>, today: string, days = OSM_RESEND_DAYS, max = OSM_MAX_TILES): Tile[] {
  return tiles.filter((t) => {
    const last = sent[tileKey(t)]
    return !last || dayNum(today) - dayNum(last) >= days
  }).slice(0, max)
}
