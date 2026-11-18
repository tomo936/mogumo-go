import { describe, expect, it, vi } from 'vitest'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { Shop } from './shop.ts'
import { mergeShops, nameTokens, normalizeName, tokensSimilar } from './merge.ts'

// 呼び出し回数を数えるだけ（中身は本物）
vi.mock('../../map/domain/geo.ts', async (orig) => {
  const m = await orig<typeof import('../../map/domain/geo.ts')>()
  return { ...m, distanceMeters: vi.fn(m.distanceMeters) }
})

const M = 0.000009 // 緯度およそ 1m
function shop(id: string, name: string, dy = 0, details: Shop['details'] = null): Shop {
  return { id, name, lat: 35 + dy * M, lng: 139, kind: 'cafe', details, mapId: null }
}
const det = { genreCode: 'G1', genreName: 'x', catch: null, budgetName: null, photoUrl: null, open: null }

describe('normalizeName', () => {
  it('かな・括弧・記号の違いをならす', () => {
    expect(normalizeName('カフェ・もぐも（新宿店）')).toBe(normalizeName('かふぇ もぐも'))
  })
  it('全角英字と大文字小文字をならす', () => {
    expect(normalizeName('ＭＯＧＵ Cafe')).toBe(normalizeName('mogu cafe'))
  })
})

describe('normalizeName 追加', () => {
  it('末尾の 本店/支店/店 を除く', () => {
    expect(normalizeName('もぐも本店')).toBe(normalizeName('もぐも'))
    expect(normalizeName('もぐも支店')).toBe(normalizeName('もぐも'))
    expect(normalizeName('もぐも店')).toBe(normalizeName('もぐも'))
  })
  it('長音 ー は残す', () => {
    expect(normalizeName('ラーメン')).toContain('ー')
    expect(normalizeName('ラーメン')).not.toBe(normalizeName('ラメン'))
  })
})

describe('mergeShops', () => {
  it('出力順は地図の店が先、余ったホットペッパーが後', () => {
    const r = mergeShops(
      [shop('osm:1', 'あ'), shop('osm:2', 'もぐも', 100)],
      [shop('hp:x', 'ぜんぜん別', 500, det), shop('hp:1', 'もぐも', 100, det)],
    )
    expect(r.map((s) => s.id)).toEqual(['osm:1', 'hp:1', 'hp:x'])
  })
  it('1つのホットペッパーを2つの地図の店が取らない', () => {
    const r = mergeShops(
      [shop('osm:1', 'もぐも'), shop('osm:2', 'もぐも', 3)],
      [shop('hp:1', 'もぐも', 1, det)],
    )
    expect(r.map((s) => s.id)).toEqual(['hp:1', 'osm:2'])
  })
  it('2000 × 300 でも、遠い組はハバーサインを計算せず飛ばす（呼び出し回数で見る）', () => {
    const maps: Shop[] = []
    const hps: Shop[] = []
    for (let i = 0; i < 2000; i++) {
      maps.push({ id: `osm:${i}`, name: `店${i}`, lat: 35 + ((i * 37) % 1000) * M, lng: 139 + ((i * 91) % 1000) * M, kind: 'cafe', details: null, mapId: null })
    }
    for (let i = 0; i < 300; i++) {
      hps.push({ id: `hp:${i}`, name: `店${i}`, lat: 35 + ((i * 53) % 1000) * M, lng: 139 + ((i * 17) % 1000) * M, kind: 'cafe', details: det, mapId: null })
    }
    vi.mocked(distanceMeters).mockClear()
    const r = mergeShops(maps, hps)
    // 全組み合わせは 60 万。緯度・経度の差で飛ばせば、その 1/10 未満
    expect(vi.mocked(distanceMeters).mock.calls.length).toBeLessThan(60000)
    expect(r.length).toBeGreaterThanOrEqual(2000)
  })
  it('同名で20m → 合体（id は hp、位置は地図）', () => {
    const r = mergeShops([shop('osm:1', 'もぐも')], [shop('hp:1', 'もぐも', 20, det)])
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('hp:1')
    expect(r[0].lat).toBe(35)
    expect(r[0].details).toEqual(det)
    expect(r[0].mapId).toBe('osm:1') // 地図の点の id を覚えておく
  })
  it('合体しなかった店の mapId は null', () => {
    const r = mergeShops([shop('osm:1', 'あ')], [shop('hp:1', 'い', 500, det)])
    expect(r.map((s) => s.mapId)).toEqual([null, null])
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

describe('打ち間違いの許容', () => {
  const base = { kind: 'mystery' as const, details: null, mapId: null }
  const at = (id: string, name: string, northM: number) => ({ ...base, id, name, lat: 35.68 + northM / 111195, lng: 139.76 })
  it('20m 以内なら TOSOANA と トスカーナ TOSCANA を同じ店にする', () => {
    const r = mergeShops([at('osm:1', 'TOSOANA', 0)], [at('hp:1', 'トスカーナ TOSCANA', 15)])
    expect(r.map((s) => s.id)).toEqual(['hp:1'])
  })
  it('30m 離れていれば打ち間違いでは合わせない', () => {
    const r = mergeShops([at('osm:1', 'TOSOANA', 0)], [at('hp:1', 'トスカーナ TOSCANA', 30)])
    expect(r).toHaveLength(2)
  })
  it('似ていない名前はすぐ近くでも合わせない', () => {
    const r = mergeShops([at('osm:1', 'サイゼリヤ', 0)], [at('hp:1', 'ガスト', 5)])
    expect(r).toHaveLength(2)
  })
  it('短い語（3文字以下）は比べない', () => {
    expect(tokensSimilar(nameTokens('もぐ'), nameTokens('もぎ'))).toBe(false)
  })
})
