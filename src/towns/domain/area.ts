// 晴れた広さ（km²）= 晴れたマス ＋ クリアした町の面積。町の中のマスは二重に数えない。
// 記録（日付スライダー）・マイページ・実績の広さが使う。純粋な計算だけ。
import { CELL_M } from '../../fog/config.ts'
import { cellCenter } from '../../fog/domain/grid.ts'
import { inTown } from './shape.ts'
import type { ClearedTown } from './shape.ts'

const CELL_KM2 = (CELL_M * CELL_M) / 1_000_000

// cellTimes = 数えるマスの晴れた時刻、townAreas = 町がクリアされた時刻と足す広さ。どちらも時刻の順
export type AreaTimeline = { cellTimes: number[]; townAreas: { at: number; km2: number }[] }

// 町の中のマスで、町のクリアと同じか後に晴れたものは数えない（町の広さに入っている）。
// 町のクリアより前に晴れたマスは残し、その分を町の広さから引く（クリアの日に、残りが足される）
export function areaTimeline(cells: readonly { x: number; y: number; at: number }[], towns: readonly ClearedTown[]): AreaTimeline {
  const before = new Map<string, number>() // 町ごとの、クリアより前に晴れていたマスの数
  const cellTimes: number[] = []
  for (const c of cells) {
    const p = towns.length === 0 ? null : cellCenter(c)
    const town = p ? towns.find((t) => inTown(t, p)) : undefined
    if (!town) cellTimes.push(c.at)
    else if (c.at < town.at) {
      cellTimes.push(c.at)
      before.set(town.id, (before.get(town.id) ?? 0) + 1)
    }
  }
  cellTimes.sort((a, b) => a - b)
  const townAreas = towns
    .map((t) => ({ at: t.at, km2: Math.max(0, t.areaM2 / 1_000_000 - (before.get(t.id) ?? 0) * CELL_KM2) }))
    .sort((a, b) => a.at - b.at)
  return { cellTimes, townAreas }
}

// 時刻 t までに晴れた広さ（km²）
export function areaKm2At(tl: AreaTimeline, t: number): number {
  let lo = 0
  let hi = tl.cellTimes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (tl.cellTimes[mid] <= t) lo = mid + 1
    else hi = mid
  }
  let km2 = lo * CELL_KM2
  for (const a of tl.townAreas) if (a.at <= t) km2 += a.km2
  return km2
}
