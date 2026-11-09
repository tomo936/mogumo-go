import { describe, expect, it } from 'vitest'
import type { DailyHint } from './hint.ts'
import { updateRevealed } from './reveal.ts'

const M = 1 / 111195
const hint = (id: string, o: Partial<DailyHint> = {}): DailyHint => ({
  id, slot: 1, shopId: `hp:${id}`, genre: null, catch: null, budget: null, isMystery: false, completed: false,
  shop: { name: id, lat: 35, lng: 139 }, ...o,
})
const me = { lat: 35, lng: 139 }
const at = (m: number) => () => ({ lat: 35 + m * M, lng: 139 })

describe('updateRevealed', () => {
  it('30m 以内は明かす、31m は明かさない', () => {
    expect(updateRevealed(new Set(), [hint('a')], me, at(29.9)).newly).toEqual(['a'])
    expect(updateRevealed(new Set(), [hint('a')], me, at(31)).newly).toEqual([])
  })
  it('30m ぎりぎり(29.999m)は明かす', () => {
    expect(updateRevealed(new Set(), [hint('a')], me, at(29.999)).newly).toEqual(['a'])
  })
  it('一度明かした id は離れても残り、newly には入らない', () => {
    const r = updateRevealed(new Set(['a']), [hint('a')], me, at(500))
    expect([...r.revealed]).toEqual(['a'])
    expect(r.newly).toEqual([])
  })
  it('達成済みは revealed に入り newly に入らない', () => {
    const r = updateRevealed(new Set(), [hint('a', { completed: true })], me, at(500))
    expect(r.revealed.has('a')).toBe(true)
    expect(r.newly).toEqual([])
  })
})
