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

// 雲を置かない所: 晴れたセルに加えて、晴れたセルに立つお店のまわり（となりのセルまで）。
// 晴れた場所の端に立つお店の土台が、はみ出した雲に隠れて「雲の上に浮いて」見えないように（2026-11-24 オーナー）。
// 雲を置くときだけに使う（ゲームの「晴れた場所」の決まりは変えない）
export function cloudFree(cleared: Cleared, shops: readonly LatLng[]): Set<string> {
  const out = new Set(cleared)
  for (const s of shops) {
    const c = cellOf(s)
    if (!cleared.has(cellKey(c))) continue
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.add(cellKey({ x: c.x + dx, y: c.y + dy }))
  }
  return out
}
