import { describe, expect, it } from 'vitest'
import { buildZukan, filledCount, pageCount, type ZukanShop } from './zukan.ts'

const shop = (p: Partial<ZukanShop> & { id: string }): ZukanShop => ({
  name: p.id, kind: 'ramen', photoUrl: null, catch: null, genreName: null, lat: 35, lng: 139, visits: null, cleared: true, ...p,
})
const v = (count: number, firstDay: string, lastDay: string) => ({ count, firstDay, lastDay })

describe('buildZukan', () => {
  it('行った店が先（最近行った順）、「？」は後ろ', () => {
    const z = buildZukan([
      shop({ id: 'hp:A' }),
      shop({ id: 'hp:B', visits: v(1, '2026-11-01', '2026-11-01') }),
      shop({ id: 'hp:C', visits: v(2, '2026-11-02', '2026-11-08') }),
    ]).get('ramen')!
    expect(z.map((s) => s.id)).toEqual(['hp:C', 'hp:B', 'hp:A'])
  })
  it('hp: と osm: の2つの id は1枚にまとめ、記録を合わせる', () => {
    const z = buildZukan([
      shop({ id: 'hp:A', visits: v(2, '2026-11-03', '2026-11-08') }),
      shop({ id: 'osm:1', mapId: 'osm:1', visits: v(1, '2026-11-02', '2026-11-02') }),
    ]).get('ramen')!
    expect(z).toHaveLength(2)
    const a = z.find((s) => s.id === 'hp:A')!
    expect(a.visits).toEqual(v(2, '2026-11-03', '2026-11-08'))
  })
  it('記録が無い（null）店は「？」として後ろに並ぶ', () => {
    const z = buildZukan([shop({ id: 'hp:X' }), shop({ id: 'hp:Y', visits: v(1, '2026-11-01', '2026-11-01') })]).get('ramen')!
    expect(z.map((s) => s.visits !== null)).toEqual([true, false])
  })
  it('ジャンルごとに分け、店のないジャンルも空で持つ', () => {
    const m = buildZukan([shop({ id: 'hp:A', kind: 'sushi' })])
    expect(m.get('sushi')).toHaveLength(1)
    expect(m.get('ramen')).toEqual([])
  })
})

describe('晴れた場所の決め方', () => {
  it('霧の中で行ったことが無い店は出さない', () => {
    const z = buildZukan([shop({ id: 'hp:fog', cleared: false })]).get('ramen')!
    expect(z).toEqual([])
  })
  it('霧の中でも行ったことがある店は出す', () => {
    const z = buildZukan([shop({ id: 'hp:fog', cleared: false, visits: v(1, '2026-11-01', '2026-11-01') })]).get('ramen')!
    expect(z.map((s) => s.id)).toEqual(['hp:fog'])
  })
})

describe('pageCount / filledCount', () => {
  it('4 枚ずつ。0 枚は 0 ページ', () => {
    expect(pageCount(0)).toBe(0)
    expect(pageCount(4)).toBe(1)
    expect(pageCount(5)).toBe(2)
  })
  it('埋まり数は行った店の数', () => {
    expect(filledCount([shop({ id: 'a', visits: v(1, 'x', 'x') }), shop({ id: 'b' })])).toBe(1)
  })
})
