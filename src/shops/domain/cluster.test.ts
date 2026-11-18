import { describe, expect, it } from 'vitest'
import { BADGE_TEXT_FIT, BADGE_WIDEST_TEXT, badgeText, clusterFeatures, clusterScale, clusterStage, CLUSTER_MIN_POINTS, CLUSTER_UNTIL_ZOOM } from './cluster.ts'

describe('badgeText', () => {
  it('99 までは数字、100 以上は 99+', () => {
    expect(badgeText(2)).toBe('2')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
    expect(badgeText(1234)).toBe('99+')
  })
})

describe('札の字', () => {
  it('いちばん長い字は 99+（字の大きさはこれが丸に収まる大きさでそろえる）', () => {
    expect(badgeText(1000)).toBe(BADGE_WIDEST_TEXT)
    expect(BADGE_TEXT_FIT).toBeLessThan(0.9)
  })
})

describe('clusterScale', () => {
  it('2〜9・10〜29・30 以上の 3 段', () => {
    expect(clusterScale(2)).toBe(1)
    expect(clusterScale(10)).toBeGreaterThan(1)
    expect(clusterScale(30)).toBeGreaterThan(clusterScale(10))
  })
})

describe('clusterFeatures', () => {
  const single = (id: string, model = 'ramen', sizeM = 14) => ({ id, model, lat: 35, lng: 139, shopIds: [id], sizeM })
  const shop = (id: string, kind = 'cafe') => ({ id, kind, lat: 35.001, lng: 139.001 })
  const bld = (id: string, shops: ReturnType<typeof shop>[], topM = 12) => ({ id, lat: 35.002, lng: 139.002, topM, shops })
  it('施設・駅の点には fac の印を付ける（倍率 17 からはまとめに入れないため）', () => {
    const f = clusterFeatures([], [{ ...bld('fac:1', [shop('x'), shop('y'), shop('z')]), facility: true }, bld('b', [shop('p'), shop('q')])], new Set(), new Set(), new Set())
    expect(f.map((x) => [x.properties.id, x.properties.fac ?? 0])).toEqual([['fac:1', 1], ['b', 0]])
  })
  it('1 軒の店は n=1。ビル・施設は中のお店の数を持った 1 つの点（中身が分かれない）。霧の中・気配のお店は入れない', () => {
    const f = clusterFeatures(
      [single('hp:1'), single('osm:fog'), single('hp:hint')],
      [bld('bld:1', [shop('hp:2', 'sushi'), shop('hp:3'), shop('hp:hint2')]), bld('bld:fog', [shop('hp:9')])],
      new Set(['osm:fog', 'bld:fog']),
      new Set(['hp:hint', 'hp:hint2']),
      new Set(['hp:2']),
    )
    expect(f.map((x) => [x.properties.id, x.properties.n, x.properties.done, x.properties.ids])).toEqual([
      ['hp:1', 1, 0, 'hp:1'], ['bld:1', 2, 1, 'hp:2,hp:3'],
    ])
    expect([f[1].properties.kinds, f[1].properties.dones]).toEqual(['sushi,cafe', '1,0']) // 2 本に戻すときに使う
    expect(f[1].geometry.coordinates).toEqual([139.002, 35.002]) // ビルの場所
  })
  it('気配を除いて 1 軒だけ残ったビルは、そのお店の種類のピン', () => {
    const f = clusterFeatures([], [bld('b', [shop('x', 'sushi'), shop('h')])], new Set(), new Set(['h']), new Set())
    expect(f.map((x) => [x.properties.n, x.properties.kind, x.properties.ids])).toEqual([[1, 'sushi', 'x']])
  })
  it('ピンを持ち上げる高さの段（模型の高さ）を付ける。ラーメンの 14m は高い模型、カフェの 8m は低い、ビルは屋根の高さ', () => {
    const f = clusterFeatures([single('a', 'ramen', 14), single('b', 'cafe', 8)], [bld('c', [shop('x'), shop('y')], 20)], new Set(), new Set(), new Set())
    expect(f.map((x) => [x.properties.liftTier, x.properties.lt])).toEqual([['high', 2], ['low', 0], ['high', 2]])
  })
  it('段は 3 つ: 16〜17 は大きく（140px）、17〜17.7 は小さく（70px）まとめ、17.7 から全部のピン。2 軒からまとめる', () => {
    expect(clusterStage(16.4)).toEqual({ zoom: 16, radiusPx: 140 })
    expect(clusterStage(17.3)).toEqual({ zoom: 17, radiusPx: 70 })
    expect(clusterStage(CLUSTER_UNTIL_ZOOM)).toBeNull()
    expect(CLUSTER_UNTIL_ZOOM).toBe(17.7)
    expect(CLUSTER_MIN_POINTS).toBe(2)
  })
})
