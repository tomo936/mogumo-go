import { describe, expect, it } from 'vitest'
import { badgeFontRatio, badgeText, clusterFeatures, clusterScale, CLUSTER_UNTIL_ZOOM } from './cluster.ts'

describe('badgeText', () => {
  it('99 までは数字、100 以上は 99+', () => {
    expect(badgeText(2)).toBe('2')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
    expect(badgeText(1234)).toBe('99+')
  })
})

describe('badgeFontRatio', () => {
  it('桁が増えるほど字を小さく（丸の直径に対する割合）。3 文字でも丸に収まる', () => {
    expect(badgeFontRatio('5')).toBeGreaterThan(badgeFontRatio('15'))
    expect(badgeFontRatio('15')).toBeGreaterThan(badgeFontRatio('99+'))
    expect(badgeFontRatio('99+')).toBeLessThanOrEqual(0.4)
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
  const single = (id: string, model = 'ramen') => ({ id, model, lat: 35, lng: 139, shopIds: [id] })
  it('1 軒の店は n=1、ビルは中のお店の数。霧の中・気配のお店は入れない', () => {
    const f = clusterFeatures(
      [single('hp:1'), single('osm:fog'), single('hp:hint')],
      [{ id: 'bld:1', lat: 35, lng: 139, shopIds: ['hp:2', 'hp:3', 'hp:hint2'] }],
      new Set(['osm:fog']),
      new Set(['hp:hint', 'hp:hint2']),
      new Set(['hp:2']),
    )
    expect(f.map((x) => [x.properties.id, x.properties.n, x.properties.done])).toEqual([['hp:1', 1, 0], ['bld:1', 2, 1]])
    expect(f[0].properties.kind).toBe('ramen')
  })
  it('寄ったら全部（ズーム 17.5 から）', () => {
    expect(CLUSTER_UNTIL_ZOOM).toBe(17.5)
  })
})
