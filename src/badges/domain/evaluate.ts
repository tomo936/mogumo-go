// 実績の計算。チェックインの列・晴れたマス・自宅から、各バッジの取れた時刻と進み具合を出す。
// サーバーには保存しない（表示のたびに手元で計算する。2026-11-10 設計）。
import { CATALOG } from './catalog.ts'
import type { BadgeDef, BadgeInput, BadgeState, Prepared, PreparedVisit } from './types.ts'

// 日本時間の日・月・時刻・曜日を付けて、古い順に並べる
export function prepare(input: BadgeInput): Prepared {
  const visits: PreparedVisit[] = [...input.visits]
    .sort((a, b) => a.at - b.at)
    .map((v) => {
      const d = new Date(v.at + 9 * 3600_000)
      const iso = d.toISOString()
      return { ...v, day: iso.slice(0, 10), month: iso.slice(0, 7), md: iso.slice(5, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes(), dow: d.getUTCDay() }
    })
  return { visits, cellTimes: [...input.cellTimes].sort((a, b) => a - b), home: input.home }
}

const run = (d: BadgeDef, p: Prepared): BadgeState => {
  const m = d.measure(p, d.need ?? 1)
  return { def: d, earnedAt: m.at, have: d.need === null ? null : m.have }
}

export function evaluate(input: BadgeInput, catalog: BadgeDef[] = CATALOG): BadgeState[] {
  const p = prepare(input)
  return catalog.map((d) => run(d, p))
}

// 取れた実績を新しい順に n 個
export function recentEarned(states: BadgeState[], n: number): BadgeState[] {
  return states
    .filter((s): s is BadgeState & { earnedAt: number } => s.earnedAt !== null)
    .sort((a, b) => b.earnedAt - a.earnedAt)
    .slice(0, n)
}

// 「あと N◯」（取れていて・進み具合が無ければ null）
export function remaining(s: BadgeState): string | null {
  if (s.earnedAt !== null || s.have === null || s.def.need === null) return null
  const left = Math.max(0, s.def.need - s.have)
  const n = s.def.unit === 'km²' || s.def.unit === 'km' ? Math.round(left * 100) / 100 : left
  return `あと ${n}${s.def.unit}`
}

// 段のつながりごとにまとめる。見せる顔は「取れたいちばん上の段」、まだ無ければ最初の段。next は次にねらう段
export type BadgeSeries = { face: BadgeState; steps: BadgeState[]; next: BadgeState | null }
export function seriesOf(states: BadgeState[]): BadgeSeries[] {
  const map = new Map<string, BadgeState[]>()
  for (const s of states) map.set(s.def.series, [...(map.get(s.def.series) ?? []), s])
  return [...map.values()].map((steps) => {
    const got = steps.filter((s) => s.earnedAt !== null)
    return { face: got[got.length - 1] ?? steps[0], steps, next: steps.find((s) => s.earnedAt === null) ?? null }
  })
}
