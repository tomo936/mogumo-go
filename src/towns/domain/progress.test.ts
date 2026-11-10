import { describe, expect, it } from 'vitest'
import { parseSync, percent } from './progress.ts'

const boundary = { type: 'Polygon', coordinates: [[[139.63, 35.64], [139.64, 35.64], [139.64, 35.65], [139.63, 35.64]]] }
const reply = {
  towns: [
    { id: '13112-経堂', name: '経堂', city: '世田谷区', visited: 3, total: 12, cleared_at: null, completed_at: null, counting: false, last_at: '2026-11-08T03:00:00Z' },
    { id: '13112-宮坂', name: '宮坂', city: '世田谷区', visited: 2, total: 4, cleared_at: '2026-11-09T03:00:05Z', completed_at: null, counting: false, last_at: '2026-11-09T03:00:00Z' },
    { id: '13112-桜', name: '桜', city: null, visited: 1, total: 0, cleared_at: null, completed_at: null, counting: true, last_at: '2026-11-01T03:00:00Z' },
  ],
  newly: [
    { id: '13112-宮坂', name: '宮坂', kind: 'clear', coins: 100, town: { city: '世田谷区', area_m2: 512345.6, boundary, at: '2026-11-09T03:00:05Z' } },
    { id: '13112-豪徳寺', name: '豪徳寺', kind: 'complete', coins: 0, town: null },
  ],
  more: true,
}

describe('parseSync', () => {
  it('サーバーの返事を読む。町は最近行った順', () => {
    const s = parseSync(reply)
    expect(s).not.toBeNull()
    expect(s!.towns.map((t) => t.name)).toEqual(['宮坂', '経堂', '桜'])
    expect(s!.towns[0]).toEqual({
      id: '13112-宮坂', name: '宮坂', city: '世田谷区', visited: 2, total: 4,
      clearedAt: Date.parse('2026-11-09T03:00:05Z'), completedAt: null, counting: false, lastAt: Date.parse('2026-11-09T03:00:00Z'),
    })
    expect(s!.towns[2].counting).toBe(true)
    expect(s!.towns[2].city).toBeNull()
    expect(s!.more).toBe(true)
  })
  it('新しく取れたもの: クリアは町の形つき・コンプリートは形なし', () => {
    const s = parseSync(reply)!
    expect(s.newly).toHaveLength(2)
    const clear = s.newly[0]
    expect(clear.kind).toBe('clear')
    expect(clear.coins).toBe(100)
    expect(clear.town).toMatchObject({ id: '13112-宮坂', name: '宮坂', city: '世田谷区', areaM2: 512345.6, at: Date.parse('2026-11-09T03:00:05Z') })
    expect(clear.town!.bbox).toEqual([139.63, 35.64, 139.64, 35.65])
    expect(s.newly[1]).toEqual({ id: '13112-豪徳寺', name: '豪徳寺', kind: 'complete', coins: 0, town: null })
  })
  it('クリアなのに形が読めなければ、town は null（帯は出せる）', () => {
    const s = parseSync({ towns: [], newly: [{ id: 'a', name: 'あ', kind: 'clear', coins: 100, town: { city: null, area_m2: 1, boundary: { type: 'Point' }, at: '2026-11-09T03:00:05Z' } }], more: false })
    expect(s!.newly[0].town).toBeNull()
    expect(s!.more).toBe(false)
  })
  it('形が違えば null', () => {
    expect(parseSync(null)).toBeNull()
    expect(parseSync({ towns: [] })).toBeNull()
    expect(parseSync({ towns: 'x', newly: [] })).toBeNull()
    expect(parseSync({ towns: [{ id: 'a', name: 'あ', visited: -1, total: 3 }], newly: [] })).toBeNull()
    expect(parseSync({ towns: [{ id: 'a', visited: 1, total: 3 }], newly: [] })).toBeNull()
    expect(parseSync({ towns: [], newly: [{ id: 'a', name: 'あ', kind: 'other' }] })).toBeNull()
    expect(parseSync({ error: 'internal_error' })).toBeNull()
  })
  it('空の返事も読める', () => {
    expect(parseSync({ towns: [], newly: [], more: false })).toEqual({ towns: [], newly: [], more: false })
  })
})

describe('percent', () => {
  it('切り捨て。お店が無ければ 0', () => {
    expect(percent({ visited: 3, total: 12 })).toBe(25)
    expect(percent({ visited: 2, total: 3 })).toBe(66)
    expect(percent({ visited: 5, total: 5 })).toBe(100)
    expect(percent({ visited: 1, total: 0 })).toBe(0)
    expect(percent({ visited: 9, total: 5 })).toBe(100)
  })
})
