import { describe, expect, it } from 'vitest'
import { fanPositions } from './menuFan.ts'

describe('fanPositions', () => {
  it('5つは真上を中心に左右対称、すべて中心より上', () => {
    const p = fanPositions(5, 164, 634, 138)
    expect(p).toHaveLength(5)
    expect(p.every((q) => q.y < 634)).toBe(true)
    expect(p[2].x).toBeCloseTo(164, 6) // 真ん中は真上
    expect(p[0].x + p[4].x).toBeCloseTo(328, 6) // 左右対称
  })
  it('半径の内側に収まる（横幅 328 の中）', () => {
    const p = fanPositions(5, 164, 634, 138)
    expect(Math.min(...p.map((q) => q.x))).toBeGreaterThanOrEqual(0)
    expect(Math.max(...p.map((q) => q.x))).toBeLessThanOrEqual(328)
  })
  it('0個は空', () => {
    expect(fanPositions(0, 0, 0, 10)).toEqual([])
  })
})
