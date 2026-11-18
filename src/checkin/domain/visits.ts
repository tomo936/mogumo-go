// お店ごとの「わたしの記録」（行った回数・はじめての日・この前の日）と、通うと変わる枠の段。
import { jstDay } from './day.ts'

export type Visits = { count: number; firstDay: string; lastDay: string } // 日は YYYY-MM-DD（日本時間）
export type FrameTier = 'normal' | 'silver' | 'gold'

const TIERS: { tier: FrameTier; from: number }[] = [
  { tier: 'silver', from: 3 },
  { tier: 'gold', from: 10 },
]

export function addVisit(v: Visits | undefined, day: string): Visits {
  if (!v) return { count: 1, firstDay: day, lastDay: day }
  return { count: v.count + 1, firstDay: day < v.firstDay ? day : v.firstDay, lastDay: day > v.lastDay ? day : v.lastDay }
}

export function summarizeVisits(rows: { shop_id: string; checked_in_at: string }[]): Map<string, Visits> {
  const m = new Map<string, Visits>()
  for (const r of rows) m.set(r.shop_id, addVisit(m.get(r.shop_id), jstDay(new Date(r.checked_in_at))))
  return m
}

// 合体した店は hp: と osm: の2つの id に記録が分かれることがあるので合わせる
export function mergeVisits(a: Visits | undefined, b: Visits | undefined): Visits | null {
  if (!a || !b) return a ?? b ?? null
  return {
    count: a.count + b.count,
    firstDay: a.firstDay < b.firstDay ? a.firstDay : b.firstDay,
    lastDay: a.lastDay > b.lastDay ? a.lastDay : b.lastDay,
  }
}

export function frameTier(count: number): FrameTier {
  let t: FrameTier = 'normal'
  for (const x of TIERS) if (count >= x.from) t = x.tier
  return t
}

export function nextTier(count: number): { tier: FrameTier; remaining: number } | null {
  const x = TIERS.find((t) => count < t.from)
  return x ? { tier: x.tier, remaining: x.from - count } : null
}
