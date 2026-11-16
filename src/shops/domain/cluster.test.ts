import { describe, expect, it } from 'vitest'
import { BADGE_TEXT_FIT, BADGE_WIDEST_TEXT, badgeText, clusterFeatures, clusterScale, CLUSTER_MIN_POINTS, CLUSTER_UNTIL_ZOOM } from './cluster.ts'

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
  const shop = (id: string, kind = 'cafe', lat = 35.001) => ({ id, kind, lat, lng: 139.001 })
  const bld = (id: string, shops: ReturnType<typeof shop>[], topM = 12) => ({ id, topM, shops })
  it('1 軒の店はそのまま。ビル・施設の中のお店も 1 軒ずつの点（その店の場所と種類）。霧の中・気配のお店は入れない', () => {
    const f = clusterFeatures(
      [single('hp:1'), single('osm:fog'), single('hp:hint')],
      [bld('bld:1', [shop('hp:2', 'sushi'), shop('hp:3'), shop('hp:hint2')]), bld('bld:fog', [shop('hp:9')])],
      new Set(['osm:fog', 'bld:fog']),
      new Set(['hp:hint', 'hp:hint2']),
      new Set(['hp:2']),
    )
    expect(f.map((x) => [x.properties.id, x.properties.kind, x.properties.n, x.properties.done])).toEqual([
      ['hp:1', 'ramen', 1, 0], ['hp:2', 'sushi', 1, 1], ['hp:3', 'cafe', 1, 0],
    ])
    expect(f[1].geometry.coordinates).toEqual([139.001, 35.001])
  })
  it('ピンを持ち上げる高さの段（模型の高さ）を付ける。ラーメンの 14m は高い模型、カフェの 8m は低い、ビルの中は屋根の高さ', () => {
    const f = clusterFeatures([single('a', 'ramen', 14), single('b', 'cafe', 8)], [bld('c', [shop('x')], 20)], new Set(), new Set(), new Set())
    expect(f.map((x) => [x.properties.liftTier, x.properties.lt])).toEqual([['high', 2], ['low', 0], ['high', 2]])
  })
  it('段は 2 つ: 17 から全部のピン、それより引いたらまとめる。2 軒からまとめる', () => {
    expect(CLUSTER_UNTIL_ZOOM).toBe(17)
    expect(CLUSTER_MIN_POINTS).toBe(2)
  })
})
