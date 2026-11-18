import { CELL_M, REF_LAT_DEG } from '../config.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'

export type Cell = { x: number; y: number }

export const M_PER_DEG_LAT = 111195
const D_LAT = CELL_M / M_PER_DEG_LAT
const D_LNG = CELL_M / (M_PER_DEG_LAT * Math.cos((REF_LAT_DEG * Math.PI) / 180))
// 1マスの大きさ（度）。町の形をマスに直す計算（src/towns/domain/shape.ts）が使う
export const CELL_DEG = { lat: D_LAT, lng: D_LNG }

export function cellOf(p: LatLng): Cell {
  return { x: Math.floor(p.lng / D_LNG), y: Math.floor(p.lat / D_LAT) }
}

export function cellCenter(c: Cell): LatLng {
  return { lat: (c.y + 0.5) * D_LAT, lng: (c.x + 0.5) * D_LNG }
}

export function cellKey(c: Cell): string {
  return `${c.x}:${c.y}`
}

// 中心が円の中にあるセル
export function cellsInCircle(center: LatLng, radiusM: number): Cell[] {
  if (radiusM <= 0) return []
  const dLat = radiusM / M_PER_DEG_LAT
  const dLng = radiusM / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180))
  const min = cellOf({ lat: center.lat - dLat, lng: center.lng - dLng })
  const max = cellOf({ lat: center.lat + dLat, lng: center.lng + dLng })
  const cells: Cell[] = []
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      if (distanceMeters(center, cellCenter({ x, y })) <= radiusM) cells.push({ x, y })
    }
  }
  return cells
}
