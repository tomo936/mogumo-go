// クリアした町の形。形の中か・形を霧のマスに直す計算（純粋な計算だけ）。
// 町が何百km² あっても、マスに直すのは見えている範囲（center から東西南北 halfM の四角）だけ。
import { CELL_DEG, M_PER_DEG_LAT } from '../../fog/domain/grid.ts'
import type { Cell } from '../../fog/domain/grid.ts'
import type { LatLng } from '../../map/domain/geo.ts'

type Ring = number[][] // [lng, lat] の並び
export type Geometry = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] }
export type Bbox = [number, number, number, number] // minLng, minLat, maxLng, maxLat
export type ClearedTown = {
  id: string
  name: string
  city: string | null
  areaM2: number
  at: number // クリアした時刻（ms）
  geom: Geometry
  bbox: Bbox
}

const parts = (g: Geometry): Ring[][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)

const isRing = (v: unknown): boolean =>
  Array.isArray(v) && v.every((p) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
const isPolygon = (v: unknown): boolean => Array.isArray(v) && v.length > 0 && v.every(isRing)

// サーバーから来た形が読めるものか
export function isGeometry(v: unknown): v is Geometry {
  if (typeof v !== 'object' || v === null) return false
  const g = v as { type?: unknown; coordinates?: unknown }
  if (g.type === 'Polygon') return isPolygon(g.coordinates)
  if (g.type === 'MultiPolygon') return Array.isArray(g.coordinates) && g.coordinates.length > 0 && g.coordinates.every(isPolygon)
  return false
}

export function bboxOf(g: Geometry): Bbox {
  const out: Bbox = [Infinity, Infinity, -Infinity, -Infinity]
  for (const part of parts(g)) {
    for (const [lng, lat] of part[0] ?? []) {
      if (lng < out[0]) out[0] = lng
      if (lat < out[1]) out[1] = lat
      if (lng > out[2]) out[2] = lng
      if (lat > out[3]) out[3] = lat
    }
  }
  return out
}

// 部品の中か（全部の輪で偶奇を数える = 外側の輪の中で、穴の外）
function inPart(part: Ring[], lat: number, lng: number): boolean {
  let inside = false
  for (const ring of part) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

export function inGeometry(g: Geometry, p: LatLng): boolean {
  for (const part of parts(g)) if (inPart(part, p.lat, p.lng)) return true
  return false
}

export function inTown(town: { geom: Geometry; bbox: Bbox }, p: LatLng): boolean {
  const [minLng, minLat, maxLng, maxLat] = town.bbox
  return p.lng >= minLng && p.lng <= maxLng && p.lat >= minLat && p.lat <= maxLat && inGeometry(town.geom, p)
}

// 町の形の中にあるマス（マスの中心が形の中）。center から東西南北 halfM の四角の中だけ。
// 行（緯度）ごとに輪郭との交わりを求めて、そのあいだを塗る（マス1つずつ調べるより速い）
export function cellsInTown(town: { geom: Geometry; bbox: Bbox }, center: LatLng, halfM: number): Cell[] {
  if (halfM <= 0) return []
  const dLat = halfM / M_PER_DEG_LAT
  const dLng = halfM / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180))
  const minLng = Math.max(town.bbox[0], center.lng - dLng)
  const minLat = Math.max(town.bbox[1], center.lat - dLat)
  const maxLng = Math.min(town.bbox[2], center.lng + dLng)
  const maxLat = Math.min(town.bbox[3], center.lat + dLat)
  if (minLng > maxLng || minLat > maxLat) return []
  // マスの中心が四角の中にある範囲
  const x0 = Math.ceil(minLng / CELL_DEG.lng - 0.5)
  const x1 = Math.floor(maxLng / CELL_DEG.lng - 0.5)
  const y0 = Math.ceil(minLat / CELL_DEG.lat - 0.5)
  const y1 = Math.floor(maxLat / CELL_DEG.lat - 0.5)
  const cells: Cell[] = []
  for (const part of parts(town.geom)) {
    for (let y = y0; y <= y1; y++) {
      const lat = (y + 0.5) * CELL_DEG.lat
      const xs: number[] = []
      for (const ring of part) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]
          const [xj, yj] = ring[j]
          if (yi > lat !== yj > lat) xs.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi)
        }
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // 中心の経度が [xs[k], xs[k+1]) にあるマス
        const from = Math.max(x0, Math.ceil(xs[k] / CELL_DEG.lng - 0.5))
        const to = Math.min(x1, Math.ceil(xs[k + 1] / CELL_DEG.lng - 0.5) - 1)
        for (let x = from; x <= to; x++) cells.push({ x, y })
      }
    }
  }
  return cells
}
