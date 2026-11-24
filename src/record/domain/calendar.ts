// 記録のカレンダー（2026-11-24 B-24）。月の日を週ごとに並べ、行った日の軒数を数える
export type CalDay = { day: string; date: number; inMonth: boolean } // day: 'YYYY-MM-DD'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

// 月（'YYYY-MM'）のカレンダーの升目。日曜はじまり、前後の月の日で埋めて 7 の倍数にする
export function monthGrid(month: string): CalDay[] {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const first = new Date(Date.UTC(y, m - 1, 1))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const out: CalDay[] = []
  for (let i = first.getUTCDay(); i > 0; i--) {
    const d = new Date(Date.UTC(y, m - 1, 1 - i))
    out.push({ day: ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), date: d.getUTCDate(), inMonth: false })
  }
  for (let d = 1; d <= days; d++) out.push({ day: ymd(y, m, d), date: d, inMonth: true })
  while (out.length % 7 !== 0) {
    const d = new Date(Date.UTC(y, m, out.length - days - first.getUTCDay() + 1))
    out.push({ day: ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), date: d.getUTCDate(), inMonth: false })
  }
  return out
}

export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7)) - 1 + n
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

// 日ごとの行った回数
export function countByDay(visits: readonly { day: string }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const v of visits) m.set(v.day, (m.get(v.day) ?? 0) + 1)
  return m
}
