import { describe, expect, it } from 'vitest'
import type { Shop } from '../../shops/domain/shop.ts'
import { budgetLabel, catchLabel, distanceLabel, genreLabel, guideShops, hintLines, hintPosition, matchesShop, MYSTERY_TEXT, roundDistance } from './hint.ts'
import type { DailyHint } from './hint.ts'

const M = 1 / 111195 // 1m の緯度の差
const hint = (o: Partial<DailyHint> = {}): DailyHint => ({
  id: 'h1', slot: 1, shopId: 'hp:X', genre: '中華', catch: '自家製麺', budget: '1,000円台', isMystery: false, completed: false,
  shop: { name: 'ラーメン一郎', lat: 35, lng: 139 }, ...o,
})
const shop = (o: Partial<Shop> = {}): Shop => ({ id: 'osm:1', name: '店', lat: 35, lng: 139, kind: 'ramen', details: null, mapId: null, ...o })

describe('文', () => {
  it('genreLabel', () => {
    expect(genreLabel(hint())).toBe('中華？')
    expect(genreLabel(hint({ genre: null }))).toBe('ジャンル？')
    expect(genreLabel(hint({ isMystery: true, genre: null }))).toBe('謎の気配')
  })
  it('catchLabel / budgetLabel', () => {
    expect(catchLabel('自家製麺')).toBe('…自家製麺…')
    expect(catchLabel('あいう…')).toBe('…あいう…')
    expect(catchLabel(null)).toBeNull()
    expect(budgetLabel('1,000円台')).toBe('予算 1,000円台')
    expect(budgetLabel(null)).toBeNull()
  })
  it('hintLines: 通常は3行、null は除く、謎は1行', () => {
    expect(hintLines(hint())).toEqual(['中華？', '…自家製麺…', '予算 1,000円台'])
    expect(hintLines(hint({ catch: null, budget: null }))).toEqual(['中華？'])
    expect(hintLines(hint({ isMystery: true, genre: null, catch: null, budget: null }))).toEqual([MYSTERY_TEXT])
  })
})

describe('距離の丸め', () => {
  it.each([[84, 80], [99, 100], [120, 100], [430, 450], [5, 10]])('%i → %i', (m, r) => {
    expect(roundDistance(m)).toBe(r)
  })
  it('distanceLabel', () => expect(distanceLabel(430)).toBe('ここから 約450m'))
})

describe('matchesShop', () => {
  it('id・mapId が同じ', () => {
    expect(matchesShop(hint(), shop({ id: 'hp:X' }))).toBe(true)
    expect(matchesShop(hint(), shop({ id: 'hp:Z', mapId: 'hp:X' }))).toBe(true)
    expect(matchesShop(hint({ shopId: 'osm:5' }), shop({ id: 'hp:Z', mapId: 'osm:5' }))).toBe(true)
  })
  it('hp の気配と osm の店が 20m・名前が含み合う → true', () => {
    expect(matchesShop(hint(), shop({ name: '一郎', lat: 35 + 20 * M }))).toBe(true)
  })
  it('20m でも名前が違えば false、60m なら名前が同じでも false', () => {
    expect(matchesShop(hint(), shop({ name: '二郎', lat: 35 + 20 * M }))).toBe(false)
    expect(matchesShop(hint(), shop({ name: '一郎', lat: 35 + 60 * M }))).toBe(false)
  })
})

it('hintPosition: mapId で合う店の位置、無ければ h.shop', () => {
  const s = shop({ id: 'hp:X', mapId: 'osm:9', lat: 35.001, lng: 139.002 })
  expect(hintPosition(hint(), [s])).toEqual({ lat: 35.001, lng: 139.002 })
  expect(hintPosition(hint(), [shop({ id: 'osm:2' })])).toEqual({ lat: 35, lng: 139 })
})

it('guideShops: 済み（mapId でも）・名前なしを外し、近い順に3件', () => {
  const me = { lat: 35, lng: 139 }
  const near = [
    shop({ id: 'a', name: 'A', lat: 35 + 400 * M }),
    shop({ id: 'b', name: 'B', lat: 35 + 100 * M }),
    shop({ id: 'c', name: '', lat: 35 + 10 * M }),
    shop({ id: 'd', name: 'D', lat: 35 + 20 * M }),
    shop({ id: 'e', name: 'E', lat: 35 + 30 * M, mapId: 'osm:e' }),
    shop({ id: 'f', name: 'F', lat: 35 + 200 * M }),
    shop({ id: 'g', name: 'G', lat: 35 + 300 * M }),
  ]
  expect(guideShops(near, new Set(['d', 'osm:e']), me).map((s) => s.id)).toEqual(['b', 'f', 'g'])
})
