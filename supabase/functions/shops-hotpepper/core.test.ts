import { describe, expect, it } from 'vitest'
import { roundCenter as clientRound } from '../../../src/shops/infra/hotpepper.ts'
import { dedupeRows, hotpepperError, hotpepperUrl, parseHotpepper, rawShopCount, roundCenter } from './core.ts'

const fixture = {
  results: {
    shop: [
      {
        id: 'J001', name: '麺屋いろは', lat: '35.681', lng: 139.767,
        genre: { code: 'G013', name: 'ラーメン' }, catch: 'こだわりの一杯',
        budget: { code: 'B002', name: '~1000円' }, photo: { mobile: { l: 'https://x/l.jpg', s: 'https://x/s.jpg' } },
        open: '月～日 11:00～22:00',
      },
      { id: 'J002', name: '', lat: 35.7, lng: 139.8 },
    ],
  },
}

describe('roundCenter', () => {
  it('クライアントの roundCenter と同じ結果', () => {
    const pts = [[35.6909, 139.7003], [35.6812, 139.7671], [34.7, 135.5], [43.06, 141.35], [26.2, 127.68]]
    for (const [lat, lng] of pts) {
      expect(roundCenter(lat, lng)).toEqual(clientRound({ lat, lng }, 250))
    }
  })
})

describe('hotpepperUrl', () => {
  it('必要な引数が入る', () => {
    const u = hotpepperUrl('KEY', 35.68, 139.76, 101)
    expect(u).toContain('https://webservice.recruit.co.jp/hotpepper/gourmet/v1/')
    expect(u).toContain('range=3')
    expect(u).toContain('count=100')
    expect(u).toContain('format=json')
    expect(u).toContain('start=101')
  })
})

describe('parseHotpepper', () => {
  it('名前なしを捨てて1件、hp: の id と open を写す', () => {
    const rows = parseHotpepper(fixture)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      shop_id: 'hp:J001', name: '麺屋いろは', lat: 35.681, lng: 139.767,
      genre_code: 'G013', genre_name: 'ラーメン', catch: 'こだわりの一杯',
      budget_code: 'B002', budget_name: '~1000円', photo_url: 'https://x/l.jpg', open: '月～日 11:00～22:00',
    })
  })
  it('壊れた形は空配列', () => {
    expect(parseHotpepper(null)).toEqual([])
    expect(parseHotpepper('x')).toEqual([])
    expect(parseHotpepper({ results: { shop: 'x' } })).toEqual([])
  })
})

describe('hotpepperError', () => {
  it('results.error があれば true', () => {
    expect(hotpepperError({ results: { error: [{ code: 2000, message: 'x' }] } })).toBe(true)
    expect(hotpepperError(fixture)).toBe(false)
    expect(hotpepperError(null)).toBe(false)
  })
})

describe('rawShopCount', () => {
  it('名前なしも数える', () => {
    expect(rawShopCount(fixture)).toBe(2)
    expect(rawShopCount(null)).toBe(0)
    expect(rawShopCount({ results: {} })).toBe(0)
  })
})

describe('dedupeRows', () => {
  it('shop_id が重なったら最初を残す', () => {
    const [a] = parseHotpepper(fixture)
    const rows = dedupeRows([a, { ...a, name: '別' }, { ...a, shop_id: 'hp:J9' }])
    expect(rows.map((r) => r.shop_id)).toEqual(['hp:J001', 'hp:J9'])
    expect(rows[0].name).toBe('麺屋いろは')
  })
})
