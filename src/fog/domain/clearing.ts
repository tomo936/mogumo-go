import { HOME_CLEAR_RADIUS_M } from '../config.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { cellCenter, cellKey, cellOf, cellsInCircle } from './grid.ts'

export type Cleared = ReadonlySet<string> // セルのキー

export function clearedFromHome(home: LatLng | null): Set<string> {
  if (!home) return new Set()
  return new Set(cellsInCircle(home, HOME_CLEAR_RADIUS_M).map(cellKey))
}

export function isClearedAt(cleared: Cleared, p: LatLng): boolean {
  return cleared.has(cellKey(cellOf(p)))
}

// いちばん近い晴れセルの中心までの距離。maxM までに無ければ Infinity
export function distanceToCleared(cleared: Cleared, p: LatLng, maxM: number): number {
  if (cleared.size === 0) return Infinity
  let best = Infinity
  for (const c of cellsInCircle(p, maxM)) {
    if (!cleared.has(cellKey(c))) continue
    best = Math.min(best, distanceMeters(p, cellCenter(c)))
  }
  return best
}
