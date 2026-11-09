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
}

export const DAY_MS = 86_400_000

export function timeRange(cells: ClearedCell[]): { start: number; end: number } | null {
  if (cells.length === 0) return null
  let start = Infinity
  let end = -Infinity
  for (const c of cells) {
    if (c.at < start) start = c.at
    if (c.at > end) end = c.at
  }
  return { start, end }
}

// 時刻 t での光り方（0〜1）。晴れた瞬間から fadeMs かけて、だんだん明るくなる（ふわっと増える）
export function alphaAt(cellAt: number, t: number, fadeMs: number): number {
  if (t < cellAt) return 0
  if (fadeMs <= 0) return 1
  return Math.min(1, (t - cellAt) / fadeMs)
}

// スライダーが動いたときの、光り方の長さ。全体が短くても長くても、ふわっと見えるように範囲に合わせる
export function fadeFor(range: { start: number; end: number } | null): number {
  if (!range) return DAY_MS
  return Math.max(DAY_MS, (range.end - range.start) * 0.06)
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
