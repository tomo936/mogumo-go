// 記録（天からの地図＋日付スライダー）の計算。純粋な計算だけ。
// 晴れた場所のマスは、いつ晴れたか（cleared_at）を持つ。スライダーの日付より前のマスだけが、ふわっと光って見える。
// 歩いた道の記録ではない（仕様 S7）。晴れた場所の増え方だけを見せる。
import { CELL_M } from '../../fog/config.ts'
import type { ShopKind } from '../../shops/domain/shop.ts'
import { jstDay } from '../../checkin/domain/day.ts'

export type ClearedCell = { x: number; y: number; at: number } // at = 晴れた時刻（ms）

export type VisitEntry = {
  shopId: string
  name: string
  kind: ShopKind
  photoUrl: string | null
  day: string // YYYY-MM-DD（日本時間）
  at: number // 行った時刻（ms）
  lat: number | null // お店の位置（無ければ null。地図のピンに出さない）
  lng: number | null
  wasHint: boolean // 気配のお店として行った
  mysteryHint: boolean // 謎の気配として行った
}

export const DAY_MS = 86_400_000

// スライダーの範囲。extra は、マスのほかに範囲へ入れる時刻（町をクリアした時刻）
export function timeRange(cells: ClearedCell[], extra: readonly number[] = []): { start: number; end: number } | null {
  if (cells.length === 0 && extra.length === 0) return null
  let start = Infinity
  let end = -Infinity
  for (const c of cells) {
    if (c.at < start) start = c.at
    if (c.at > end) end = c.at
  }
  for (const at of extra) {
    if (at < start) start = at
    if (at > end) end = at
  }
  return { start, end }
}

export function clearedAt(cells: ClearedCell[], t: number): ClearedCell[] {
  return cells.filter((c) => c.at <= t)
}

// マスの数を面積（km²）にする（1マス = CELL_M × CELL_M）
export function areaKm2(cellCount: number): number {
  return (cellCount * CELL_M * CELL_M) / 1_000_000
}

// 日付の目盛り（1週ずつ送る）。範囲の外に出ない
export function stepWeek(t: number, direction: 1 | -1, range: { start: number; end: number }): number {
  return Math.min(range.end, Math.max(range.start, t + direction * 7 * DAY_MS))
}

// 'YYYY-MM-DD' → '2026年11月'
export function monthLabel(day: string): string {
  const [y, m] = day.split('-')
  return `${y}年${Number(m)}月`
}

// 月ごとにまとめる（新しい月が先、月の中も新しい日が先）。t（ms）より後の日は入れない
export function groupByMonth(entries: VisitEntry[], t: number = Infinity): { month: string; items: VisitEntry[] }[] {
  // t と同じ日（日本時間）に行ったお店も入れる
  const tDay = Number.isFinite(t) ? jstDay(new Date(t)) : null
  const upto = tDay === null ? entries : entries.filter((e) => e.day <= tDay)
  const sorted = [...upto].sort((a, b) => b.day.localeCompare(a.day))
  const groups: { month: string; items: VisitEntry[] }[] = []
  for (const e of sorted) {
    const month = monthLabel(e.day)
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.items.push(e)
    else groups.push({ month, items: [e] })
  }
  return groups
}
