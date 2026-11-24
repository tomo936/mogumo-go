// 食べ歩きの統計（2026-11-24 「すぐ」の 5）。自分の訪問の記録から計算するだけ
import type { ShopKind } from '../../shops/domain/shop.ts'

export type StatVisit = { shopId: string; kind: ShopKind; day: string } // day: 'YYYY-MM-DD'（日本の日付）

export type EatStats = {
  shops: number // 行ったお店（重なりなし）
  visits: number // 行った回数
  kinds: number // 行った種類の数（なぞを除く）
  topKind: { kind: ShopKind; shops: number } | null // いちばん多く行った種類（お店の数。同じ数なら回数の多い方）
  months: { month: string; visits: number }[] // 直近 6 か月（古い順。'YYYY-MM'）
}

const monthsBack = (today: string, n: number): string[] => {
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return out
}

export function eatStats(visits: readonly StatVisit[], today: string): EatStats {
  const shopsByKind = new Map<ShopKind, Set<string>>()
  const visitsByKind = new Map<ShopKind, number>()
  const shops = new Set<string>()
  for (const v of visits) {
    shops.add(v.shopId)
    if (!shopsByKind.has(v.kind)) shopsByKind.set(v.kind, new Set())
    shopsByKind.get(v.kind)!.add(v.shopId)
    visitsByKind.set(v.kind, (visitsByKind.get(v.kind) ?? 0) + 1)
  }
  let topKind: EatStats['topKind'] = null
  for (const [kind, set] of shopsByKind) {
    if (kind === 'mystery') continue
    const better = !topKind || set.size > topKind.shops || (set.size === topKind.shops && (visitsByKind.get(kind) ?? 0) > (visitsByKind.get(topKind.kind) ?? 0))
    if (better) topKind = { kind, shops: set.size }
  }
  const months = monthsBack(today, 6).map((month) => ({ month, visits: visits.filter((v) => v.day.startsWith(month)).length }))
  return { shops: shops.size, visits: visits.length, kinds: [...shopsByKind.keys()].filter((k) => k !== 'mystery').length, topKind, months }
}
