// ガチャの決まり（見せる側）と、SQL 関数の返事の読み取り。抽選そのものはサーバー（SQL 0014 の draw_gacha）
import type { Rarity } from './characters.ts'

export const DRAW_COST = { single: 100, ten: 1000 } as const
export type DrawType = keyof typeof DRAW_COST
export const CEILING = 30 // 前の ★5 から数えて 30 回目は ★5
export const FRIENDSHIP_MAX = 5
export const RATES: Record<Rarity, number> = { 5: 5, 4: 25, 3: 70 } // %

export type Guarantee = 'none' | 'ten_floor' | 'ceiling'
export type Draw = { pos: number; characterId: number; rarity: Rarity; guarantee: Guarantee; isNew: boolean; friendship: number }
export type DrawResult = { status: 'ok'; draws: Draw[] } | { status: 'insufficient' }

export const friendshipHearts = (dup: number): number => Math.min(FRIENDSHIP_MAX, Math.max(0, Math.floor(dup)))
export const untilCeiling = (pullsSinceFive: number): number => Math.max(1, CEILING - pullsSinceFive)

const isRarity = (v: unknown): v is Rarity => v === 3 || v === 4 || v === 5
const isGuarantee = (v: unknown): v is Guarantee => v === 'none' || v === 'ten_floor' || v === 'ceiling'
const rec = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null)

export function parseDrawResult(data: unknown): DrawResult | null {
  if (!Array.isArray(data) || data.length === 0) return null
  const first = rec(data[0])
  if (first?.status === 'insufficient') return { status: 'insufficient' }
  const draws: Draw[] = []
  for (const v of data) {
    const r = rec(v)
    if (!r || r.status !== 'ok') return null
    if (typeof r.pos !== 'number' || typeof r.character_id !== 'number' || !isRarity(r.rarity)) return null
    if (!isGuarantee(r.guarantee) || typeof r.is_new !== 'boolean' || typeof r.friendship !== 'number') return null
    draws.push({ pos: r.pos, characterId: r.character_id, rarity: r.rarity, guarantee: r.guarantee, isNew: r.is_new, friendship: r.friendship })
  }
  return { status: 'ok', draws: draws.sort((a, b) => a.pos - b.pos) }
}

export function parseGachaState(data: unknown): { pullsSinceFive: number; currentId: number | null } | null {
  const r = rec(Array.isArray(data) ? data[0] : data)
  if (!r || typeof r.pulls_since_five !== 'number') return null
  return { pullsSinceFive: r.pulls_since_five, currentId: typeof r.current_character_id === 'number' ? r.current_character_id : null }
}

export function parseOwned(data: unknown): Map<number, number> {
  const out = new Map<number, number>()
  if (!Array.isArray(data)) return out
  for (const v of data) {
    const r = rec(v)
    if (r && typeof r.character_id === 'number' && typeof r.duplicate_count === 'number') out.set(r.character_id, r.duplicate_count)
  }
  return out
}

export const bestRarity = (draws: Draw[]): Rarity => draws.reduce<Rarity>((m, d) => (d.rarity > m ? d.rarity : m), 3)
