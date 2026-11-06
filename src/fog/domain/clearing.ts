import { HOME_CLEAR_RADIUS_M } from '../config.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { M_PER_DEG_LAT, cellCenter, cellKey, cellOf, cellsInCircle } from './grid.ts'

export type Cleared = ReadonlySet<string> // セルのキー

export function clearedFromHome(home: LatLng | null): Set<string> {
  if (!home) return new Set()
  return new Set(cellsInCircle(home, HOME_CLEAR_RADIUS_M).map(cellKey))
}

export function isClearedAt(cleared: Cleared, p: LatLng): boolean {
  return cleared.has(cellKey(cellOf(p)))
}

// 晴れセルの中心を一度だけ取り出す（雲をたくさん調べるとき用）
export function clearedCenters(cleared: Cleared): LatLng[] {
  return [...cleared].map((key) => {
    const [x, y] = key.split(':')
    return cellCenter({ x: Number(x), y: Number(y) })
  })
}

// いちばん近い晴れセルの中心までの距離（近似の平面距離）。maxM までに無ければ Infinity
export function nearestCenterDistance(centers: readonly LatLng[], p: LatLng, maxM: number): number {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180)
  let best = maxM * maxM
  for (const c of centers) {
    const dy = (c.lat - p.lat) * M_PER_DEG_LAT
    if (dy * dy > best) continue
    const dx = (c.lng - p.lng) * mPerDegLng
    best = Math.min(best, dx * dx + dy * dy)
  }
  return best < maxM * maxM ? Math.sqrt(best) : Infinity
}

export function distanceToCleared(cleared: Cleared, p: LatLng, maxM: number): number {
  return nearestCenterDistance(clearedCenters(cleared), p, maxM)
}
