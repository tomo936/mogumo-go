import { CELL_M, CLOUD_CHUNK_M, CLOUD_CLEAR_MARGIN_M, CLOUD_GAP_M, CLOUD_REACH_M } from '../config.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { clearedCenters, nearestCenterDistance } from './clearing.ts'
import type { Cleared } from './clearing.ts'
import { M_PER_DEG_LAT, cellCenter, cellOf } from './grid.ts'

export type CloudSpot = {
  lat: number
  lng: number
  widthM: number
  heightM: number
  rotRad: number
  kind: 0 | 1 | 2
}

// 世界固定の格子。刻みは セルの刻み × (CLOUD_GAP_M / CELL_M)
const o = cellCenter({ x: 0, y: 0 })
const u = cellCenter({ x: 1, y: 1 })
const RATIO = CLOUD_GAP_M / CELL_M
const STEP_LNG = (u.lng - o.lng) * RATIO
const STEP_LAT = (u.lat - o.lat) * RATIO

// 格子番号と salt から [0,1) を作る決まった値のハッシュ
function hash01(ix: number, iy: number, salt: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(salt + 1, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = Math.imul(h ^ (h >>> 16), 2654435761)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function cloudSpots(center: LatLng, cleared: Cleared): CloudSpot[] {
  const dLat = CLOUD_REACH_M / M_PER_DEG_LAT
  const dLng = CLOUD_REACH_M / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180))
  const centers = clearedCenters(cleared)
  const ixMin = Math.floor((center.lng - dLng) / STEP_LNG)
  const ixMax = Math.floor((center.lng + dLng) / STEP_LNG)
  const iyMin = Math.floor((center.lat - dLat) / STEP_LAT)
  const iyMax = Math.floor((center.lat + dLat) / STEP_LAT)
  const spots: CloudSpot[] = []
  for (let ix = ixMin; ix <= ixMax; ix++) {
    for (let iy = iyMin; iy <= iyMax; iy++) {
      const p = {
        lng: (ix + 0.5 + (hash01(ix, iy, 5) - 0.5) * 0.9) * STEP_LNG,
        lat: (iy + 0.5 + (hash01(ix, iy, 6) - 0.5) * 0.9) * STEP_LAT,
      }
      if (distanceMeters(center, p) > CLOUD_REACH_M) continue
      const d = nearestCenterDistance(centers, p, 400)
      if (d <= CLOUD_CLEAR_MARGIN_M) continue
      const k = clamp01((d - 40) / 320)
      const r1 = hash01(ix, iy, 1)
      const r2 = hash01(ix, iy, 2)
      const r3 = hash01(ix, iy, 3)
      const r4 = hash01(ix, iy, 4)
      spots.push({
        ...p,
        widthM: (60 + 50 * r1) * (0.7 + 0.5 * k),
        heightM: (8 + 40 * r2) * k,
        rotRad: (r3 - 0.5) * 0.5,
        kind: Math.floor(r4 * 3) as 0 | 1 | 2,
      })
    }
  }
  return spots
}

// CLOUD_CHUNK_M 四方の区画のキー
export function chunkOf(s: CloudSpot): string {
  const c = cellOf(s)
  const n = CLOUD_CHUNK_M / CELL_M
  return `${Math.floor(c.x / n)}:${Math.floor(c.y / n)}`
}
