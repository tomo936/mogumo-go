import { describe, expect, it } from 'vitest'
import type { DailyHint, HintSet } from './hint.ts'
import { emptyGate, mayGenerate, pushSample, showRegen } from './when.ts'
import type { SpeedGate } from './when.ts'

const M = 1 / 111195
const at = (m: number) => ({ lat: 35 + m * M, lng: 139 })
const feed = (g: SpeedGate, pts: [number, number][]) => pts.reduce((acc, [t, m]) => pushSample(acc, { p: at(m), t: t * 1000 }), g)

describe('速さ', () => {
  it('10秒で 50m（18km/h）→ 作らない。29秒遅い → まだ、30秒遅い → 作る', () => {
    let g = feed(emptyGate, [[0, 0], [10, 50]])
    expect(mayGenerate(g, 10_000)).toBe(false)
    // その後は止まっている
    g = feed(g, [[20, 50], [30, 50], [39, 50]])
    expect(mayGenerate(g, 39_000)).toBe(false) // 速かった 10 秒から 29 秒
    g = feed(g, [[40, 50]])
    expect(mayGenerate(g, 40_000)).toBe(true)
  })
  it('10秒で 41m（約14.8km/h）→ 作る', () => {
    const g = feed(emptyGate, [[0, 0], [10, 41]])
    expect(mayGenerate(g, 10_000)).toBe(true)
  })
  it('点が1つ・幅が短いときは遅いとみなして作る', () => {
    expect(mayGenerate(feed(emptyGate, [[0, 0]]), 0)).toBe(true)
    expect(mayGenerate(feed(emptyGate, [[0, 0], [2, 100]]), 2000)).toBe(true)
  })
})

describe('showRegen', () => {
  const hint = (o: Partial<DailyHint> = {}): DailyHint => ({
    id: 'h', slot: 1, shopId: 'hp:h', genre: null, catch: null, budget: null, isMystery: false, completed: false,
    shop: { name: 'x', lat: 35, lng: 139 }, ...o,
  })
  const set = (o: Partial<HintSet> = {}, hints = [hint()]): HintSet => ({ day: '2026-11-07', generation: 1, regenLeft: 1, hints, ...o })
  it('重心から 1500m ちょうど → true、1499m → false', () => {
    expect(showRegen(set(), at(1500))).toBe(true)
    expect(showRegen(set(), at(1499))).toBe(false)
  })
  it('達成あり・regenLeft 0・組が null か空 → false', () => {
    expect(showRegen(set({}, [hint({ completed: true })]), at(3000))).toBe(false)
    expect(showRegen(set({ regenLeft: 0 }), at(3000))).toBe(false)
    expect(showRegen(null, at(3000))).toBe(false)
    expect(showRegen(set({}, []), at(3000))).toBe(false)
  })
  it('位置が分からなければ false', () => {
    expect(showRegen(set(), null)).toBe(false)
  })
})
