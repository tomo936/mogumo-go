import { describe, expect, it } from 'vitest'
import { ripplesAt } from './ripple.ts'

describe('ripplesAt', () => {
  it('同じ間隔で count 本の波を出す', () => {
    expect(ripplesAt(0, 50, 2600, 2)).toHaveLength(2)
  })
  it('波は足元から外へ広がり、50m を超えない', () => {
    const [a] = ripplesAt(260, 50, 2600, 1)
    const [b] = ripplesAt(2340, 50, 2600, 1)
    expect(a.radiusM).toBeLessThan(b.radiusM)
    expect(b.radiusM).toBeLessThanOrEqual(50)
  })
  it('出はじめと外へ着くときは見えない（ふわっと出て消える）', () => {
    expect(ripplesAt(0, 50, 2600, 1)[0].opacity).toBe(0)
    expect(ripplesAt(2599.9, 50, 2600, 1)[0].opacity).toBeLessThan(0.01)
    expect(ripplesAt(800, 50, 2600, 1)[0].opacity).toBeGreaterThan(0.4)
  })
  it('2 本目は半周期ずれる', () => {
    const [a, b] = ripplesAt(0, 50, 2600, 2)
    expect(b.radiusM).toBeCloseTo(ripplesAt(1300, 50, 2600, 1)[0].radiusM)
    expect(a.radiusM).toBeLessThan(b.radiusM)
  })
  it('周期でくり返す', () => {
    expect(ripplesAt(700, 50, 2600, 1)[0]).toEqual(ripplesAt(700 + 2600 * 3, 50, 2600, 1)[0])
  })
})
