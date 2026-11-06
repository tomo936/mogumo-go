import { HOME_CLEAR_RADIUS_M } from '../config.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { cellKey, cellOf, cellsInCircle } from './grid.ts'

export type Cleared = ReadonlySet<string> // セルのキー

export function clearedFromHome(home: LatLng | null): Set<string> {
  if (!home) return new Set()
  return new Set(cellsInCircle(home, HOME_CLEAR_RADIUS_M).map(cellKey))
}

export function isClearedAt(cleared: Cleared, p: LatLng): boolean {
  return cleared.has(cellKey(cellOf(p)))
}
