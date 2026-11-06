// checkin の純粋な部分（Deno・npm を import しない）。テストは vitest で core.ts だけを読む。
export const CHECKIN_M = 50 // チェックインできる距離
export const CLEAR_M = 200 // 店のまわりを晴らす半径

const EARTH_RADIUS_M = 6371008.8 // src/map/domain/geo.ts と同じ
const M_PER_DEG_LAT = 111195 // src/fog/domain/grid.ts と同じ
const CELL_M = 25
const REF_LAT_DEG = 35
const D_LAT = CELL_M / M_PER_DEG_LAT
const D_LNG = CELL_M / (M_PER_DEG_LAT * Math.cos((REF_LAT_DEG * Math.PI) / 180))
const rad = (deg: number) => (deg * Math.PI) / 180

type LatLng = { lat: number; lng: number }

// ハバーサイン。distanceMeters と同じ式
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// 中心が円の中にあるセル（クライアントの cellsInCircle と同じ結果）
export function cellsAround(lat: number, lng: number, radiusM: number): [number, number][] {
  if (radiusM <= 0) return []
  const dLat = radiusM / M_PER_DEG_LAT
  const dLng = radiusM / (M_PER_DEG_LAT * Math.cos(rad(lat)))
  const minX = Math.floor((lng - dLng) / D_LNG)
  const maxX = Math.floor((lng + dLng) / D_LNG)
  const minY = Math.floor((lat - dLat) / D_LAT)
  const maxY = Math.floor((lat + dLat) / D_LAT)
  const cells: [number, number][] = []
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const c = { lat: (y + 0.5) * D_LAT, lng: (x + 0.5) * D_LNG }
      if (distanceM({ lat, lng }, c) <= radiusM) cells.push([x, y])
    }
  }
  return cells
}

// 日の区切り（N-08 未決定のため JST 0時）。変えるならここだけ
export function jstDay(now: Date): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export function tileXY(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const latR = rad(lat)
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n)
  return { x, y }
}

// タイル (x,y) の西端の経度・北端の緯度
const tileLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const tileLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / 2 ** z)) * 180) / Math.PI

// 位置を含むタイルを先頭に、端から edgeM 以内ならその側の隣のタイルも返す（角なら斜めも）
export function tilesToTry(lat: number, lng: number, z: number, edgeM: number): { x: number; y: number }[] {
  const t = tileXY(lat, lng, z)
  const mPerLng = M_PER_DEG_LAT * Math.cos(rad(lat))
  const west = (lng - tileLng(t.x, z)) * mPerLng
  const east = (tileLng(t.x + 1, z) - lng) * mPerLng
  const north = (tileLat(t.y, z) - lat) * M_PER_DEG_LAT
  const south = (lat - tileLat(t.y + 1, z)) * M_PER_DEG_LAT
  const dxs = [0]
  if (west <= edgeM) dxs.push(-1)
  if (east <= edgeM) dxs.push(1)
  const dys = [0]
  if (north <= edgeM) dys.push(-1)
  if (south <= edgeM) dys.push(1)
  const out: { x: number; y: number }[] = []
  for (const dy of dys) for (const dx of dxs) out.push({ x: t.x + dx, y: t.y + dy })
  return out
}

// 飲食店の種類。src/shops/infra/mapShops.ts の FOOD と同じにしておくこと（keep in sync）
const FOOD = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bakery', 'confectionery', 'ice_cream'])

export type PoiFeature = { id?: number | string; name?: string; subclass?: string; lng: number; lat: number }

// osmId は 'osm:<番号>'。名前のある飲食店の点だけを返す
export function findPoi(features: PoiFeature[], osmId: string): { name: string; subclass: string; lng: number; lat: number } | null {
  if (!osmId.startsWith('osm:')) return null
  const id = osmId.slice(4)
  for (const f of features) {
    if (f.id === undefined || String(f.id) !== id) continue
    if (typeof f.subclass !== 'string' || !FOOD.has(f.subclass)) continue
    if (typeof f.name !== 'string' || f.name.trim() === '') continue
    return { name: f.name, subclass: f.subclass, lng: f.lng, lat: f.lat }
  }
  return null
}
