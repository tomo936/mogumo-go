// 図鑑で読むお店を「自分のまわり」だけに絞る計算と、近くの店どうしだけでの 1 枚へのまとめ（純粋な計算）。
// shops 表はみんなの分が増え続けるので、全部は読まない（2026-11-13 オーナー「重くなってないよね？」）。
import { cellCenter } from '../../fog/domain/grid.ts'
import { mergeShops } from '../../shops/domain/merge.ts'
import type { Shop } from '../../shops/domain/shop.ts'

export const AREA_DEG = 0.02 // 読む四角の大きさ（約 2km）
const TWIN_DEG = 0.01 // まとめるときの区切り（約 1km。同じ店とみなすのは 40m 以内なので、となりまで見れば足りる）

export type Box = { south: number; north: number; west: number; east: number }

const round = (v: number) => Math.round(v * 1e6) / 1e6

// マス（"x:y"）の南西の角と北東の角（マスの外側の境目）
export function cellBounds(key: string): { south: number; north: number; west: number; east: number } | null {
  const m = /^(-?\d+):(-?\d+)$/.exec(key)
  if (!m) return null
  const x = Number(m[1])
  const y = Number(m[2])
  const sw = cellCenter({ x, y })
  const ne = cellCenter({ x: x + 1, y: y + 1 })
  const hLat = (ne.lat - sw.lat) / 2
  const hLng = (ne.lng - sw.lng) / 2
  return { south: sw.lat - hLat, north: sw.lat + hLat, west: sw.lng - hLng, east: sw.lng + hLng }
}

// 晴れたマスを、0.02 度の四角にまとめる。境目にまたがるマスは両側の四角に入れる（境目の向こうのお店を落とさない）
export function areaBoxes(clearedKeys: Iterable<string>): Box[] {
  const seen = new Map<string, Box>()
  for (const k of clearedKeys) {
    const c = cellBounds(k)
    if (!c) continue
    for (let by = Math.floor(c.south / AREA_DEG); by <= Math.floor(c.north / AREA_DEG); by++) {
      for (let bx = Math.floor(c.west / AREA_DEG); bx <= Math.floor(c.east / AREA_DEG); bx++) {
        const key = `${bx}:${by}`
        if (!seen.has(key)) seen.set(key, { south: round(by * AREA_DEG), north: round((by + 1) * AREA_DEG), west: round(bx * AREA_DEG), east: round((bx + 1) * AREA_DEG) })
      }
    }
  }
  return [...seen.values()]
}

// PostgREST の or=(...) の中身（どれかの四角に入る）
export const boxFilter = (boxes: readonly Box[]): string =>
  boxes.map((b) => `and(lat.gte.${b.south},lat.lt.${b.north},lng.gte.${b.west},lng.lt.${b.east})`).join(',')

const blockOf = (p: { lat: number; lng: number }) => ({ x: Math.floor(p.lng / TWIN_DEG), y: Math.floor(p.lat / TWIN_DEG) })

// 地図のお店（osm:）とホットペッパーのお店（hp:）の組（hp → osm）。同じ区切りとそのとなりのお店だけで比べる
export function nearbyTwins(osm: readonly Shop[], hp: readonly Shop[]): Map<string, string> {
  const hpByBlock = new Map<string, Shop[]>()
  for (const h of hp) {
    const b = blockOf(h)
    const k = `${b.x}:${b.y}`
    hpByBlock.set(k, [...(hpByBlock.get(k) ?? []), h])
  }
  const osmByBlock = new Map<string, Shop[]>()
  for (const o of osm) {
    const b = blockOf(o)
    const k = `${b.x}:${b.y}`
    osmByBlock.set(k, [...(osmByBlock.get(k) ?? []), o])
  }
  const out = new Map<string, string>()
  for (const [k, group] of osmByBlock) {
    const [x, y] = k.split(':').map(Number)
    const near: Shop[] = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const h of hpByBlock.get(`${x + dx}:${y + dy}`) ?? []) if (!out.has(h.id)) near.push(h)
    if (near.length === 0) continue
    for (const m of mergeShops(group, near)) if (m.id.startsWith('hp:') && m.mapId) out.set(m.id, m.mapId)
  }
  return out
}
