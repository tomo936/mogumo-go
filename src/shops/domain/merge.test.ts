import { describe, expect, it } from 'vitest'
import type { Shop } from './shop.ts'
import { mergeShops, normalizeName } from './merge.ts'

const M = 0.000009 // 緯度およそ 1m
function shop(id: string, name: string, dy = 0, details: Shop['details'] = null): Shop {
  return { id, name, lat: 35 + dy * M, lng: 139, kind: 'cafe', details }
}
const det = { genreCode: 'G1', genreName: 'x', catch: null, budgetName: null, open: null }

describe('normalizeName', () => {
  it('かな・括弧・記号の違いをならす', () => {
    expect(normalizeName('カフェ・もぐも（新宿店）')).toBe(normalizeName('かふぇ もぐも'))
  })
  it('全角英字と大文字小文字をならす', () => {
    expect(normalizeName('ＭＯＧＵ Cafe')).toBe(normalizeName('mogu cafe'))
  })
})

describe('mergeShops', () => {
  it('同名で20m → 合体（id は hp、位置は地図）', () => {
    const r = mergeShops([shop('osm:1', 'もぐも')], [shop('hp:1', 'もぐも', 20, det)])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('hp:1')
    expect(r[0].lat).toBe(35)
    expect(r[0].details).toEqual(det)
  })
  it('同名でも45m → 合体しない', () => {
    expect(mergeShops([shop('osm:1', 'もぐも')], [shop('hp:1', 'もぐも', 45, det)])).toHaveLength(2)
  })
  it('包含（もぐも / もぐも 新宿店）10m → 合体', () => {
    const r = mergeShops([shop('osm:1', 'もぐも')], [shop('hp:1', 'もぐも 新宿店', 10, det)])
    expect(r.map((s) => s.id)).toEqual(['hp:1'])
  })
  it('すし太郎 と そば太郎 は合体しない', () => {
    expect(mergeShops([shop('osm:1', 'すし太郎')], [shop('hp:1', 'そば太郎', 10, det)])).toHaveLength(2)
  })
  it('近い方の1件だけ合体し、もう1件は残る', () => {
    const r = mergeShops(
      [shop('osm:1', 'もぐも')],
      [shop('hp:far', 'もぐも', 30, det), shop('hp:near', 'もぐも', 5, det)],
    )
    expect(r.map((s) => s.id).sort()).toEqual(['hp:far', 'hp:near'])
    expect(r.find((s) => s.id === 'hp:near')?.lat).toBe(35)
    expect(r.find((s) => s.id === 'hp:far')?.lat).toBe(35 + 30 * M)
  })
  it('片方が空でも動く', () => {
    expect(mergeShops([], [])).toEqual([])
    expect(mergeShops([shop('osm:1', 'a')], [])).toHaveLength(1)
    expect(mergeShops([], [shop('hp:1', 'a', 0, det)])).toHaveLength(1)
  })
})
