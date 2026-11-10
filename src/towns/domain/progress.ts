// 町の進み具合（サーバーの関数 towns の返事）。純粋な計算だけ。
import { bboxOf, isGeometry } from './shape.ts'
import type { ClearedTown } from './shape.ts'

export type TownProgress = {
  id: string
  name: string
  city: string | null
  visited: number
  total: number
  clearedAt: number | null
  completedAt: number | null
  counting: boolean // お店を数えている途中（まだ分母が分からない）
  lastAt: number // 最後にその町のお店に行った時刻（ms）
}
// 今回新しく取れたもの。town はクリアのときだけ（町の霧を晴らすための形）
export type TownNews = { id: string; name: string; kind: 'clear' | 'complete'; coins: number; town: ClearedTown | null }
export type TownSync = { towns: TownProgress[]; newly: TownNews[]; more: boolean }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
const time = (v: unknown): number | null => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isFinite(t) ? t : null
}
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

// サーバーの返事を読む。形が違えば null。towns は最近行った町から
export function parseSync(json: unknown): TownSync | null {
  if (!isObj(json) || !Array.isArray(json.towns) || !Array.isArray(json.newly)) return null
  const towns: TownProgress[] = []
  for (const r of json.towns) {
    if (!isObj(r)) return null
    const id = text(r.id)
    const name = text(r.name)
    const visited = count(r.visited)
    const total = count(r.total)
    if (!id || !name || visited === null || total === null) return null
    towns.push({
      id, name, city: text(r.city), visited, total,
      clearedAt: time(r.cleared_at), completedAt: time(r.completed_at), counting: r.counting === true, lastAt: time(r.last_at) ?? 0,
    })
  }
  towns.sort((a, b) => b.lastAt - a.lastAt)
  const newly: TownNews[] = []
  for (const r of json.newly) {
    if (!isObj(r)) return null
    const id = text(r.id)
    const name = text(r.name)
    if (!id || !name || (r.kind !== 'clear' && r.kind !== 'complete')) return null
    let town: ClearedTown | null = null
    if (isObj(r.town) && isGeometry(r.town.boundary)) {
      const at = time(r.town.at)
      const area = typeof r.town.area_m2 === 'number' && Number.isFinite(r.town.area_m2) ? r.town.area_m2 : 0
      if (at !== null) town = { id, name, city: text(r.town.city), areaM2: area, at, geom: r.town.boundary, bbox: bboxOf(r.town.boundary) }
    }
    newly.push({ id, name, kind: r.kind, coins: count(r.coins) ?? 0, town })
  }
  return { towns, newly, more: json.more === true }
}

// 行った割合（%、切り捨て）。お店が無ければ 0
export function percent(p: { visited: number; total: number }): number {
  return p.total <= 0 ? 0 : Math.min(100, Math.floor((p.visited / p.total) * 100))
}
