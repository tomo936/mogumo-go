import { describe, expect, it } from 'vitest'
import { BADGE_TEXT_FIT, BADGE_WIDEST_TEXT, badgeText, BUILDING_CLUSTER_UNTIL_ZOOM, clusterFeatures, clusterScale, CLUSTER_MIN_POINTS, CLUSTER_UNTIL_ZOOM } from './cluster.ts'

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
    expect(BADGE_TEXT_FIT).toBeLessThan(0.8)
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
  const bld = (id: string, shopIds: string[], topM = 12) => ({ id, lat: 35, lng: 139, shopIds, topM })
  it('1 軒の店は n=1、ビルは中のお店の数（bld=1）。霧の中・気配のお店は入れない', () => {
    const f = clusterFeatures(
      [single('hp:1'), single('osm:fog'), single('hp:hint')],
      [bld('bld:1', ['hp:2', 'hp:3', 'hp:4', 'hp:hint2'])],
      new Set(['osm:fog']),
      new Set(['hp:hint', 'hp:hint2']),
      new Set(['hp:2']),
    )
    expect(f.map((x) => [x.properties.id, x.properties.n, x.properties.done, x.properties.bld])).toEqual([['hp:1', 1, 0, 0], ['bld:1', 3, 1, 1]])
    expect(f[0].properties.kind).toBe('ramen')
  })
  it('2 軒以下のビルはまとめに入れない（「2」の札を出さず、今までのビルのピンのまま。気配を除いて数える）', () => {
    const f = clusterFeatures([], [bld('two', ['a', 'b']), bld('three-with-hint', ['a', 'b', 'c-hint']), bld('three', ['a', 'b', 'c'])], new Set(), new Set(['c-hint']), new Set())
    expect(f.map((x) => x.properties.id)).toEqual(['three'])
  })
  it('ピンを持ち上げる高さの段（模型の高さ）を付ける。ラーメンの 14m は高い模型、カフェの 8m は低い', () => {
    const f = clusterFeatures([single('a', 'ramen', 14), single('b', 'cafe', 8)], [bld('c', ['x', 'y', 'z'], 20)], new Set(), new Set(), new Set())
    expect(f.map((x) => [x.properties.liftTier, x.properties.lt])).toEqual([['high', 2], ['low', 0], ['high', 2]])
  })
  it('寄ったら全部（17 から）。複合施設をまとめるのはいちばん引いたときだけ。3 軒以上でまとめる', () => {
    expect(CLUSTER_UNTIL_ZOOM).toBe(17) // 倍率 17 から全部のピン（17〜17.5 の細かいまとめはやめた＝オーナー 2026-11-13「3 段目いらなくない？」）
    expect(BUILDING_CLUSTER_UNTIL_ZOOM).toBeGreaterThan(16)
    expect(BUILDING_CLUSTER_UNTIL_ZOOM).toBeLessThan(CLUSTER_UNTIL_ZOOM)
    expect(CLUSTER_MIN_POINTS).toBe(3)
  })
})
