import { describe, expect, it } from 'vitest'
import { cellOf } from '../../fog/domain/grid.ts'
import { metersPerPixel } from '../../map/domain/geo.ts'
import { clearedBox, inBox, viewOf, zoomFor } from './view.ts'

const home = { lat: 35.6505, lng: 139.6365 }

describe('viewOf', () => {
  it('自宅があれば自宅が中心。晴れた場所が無ければ半径は小さい', () => {
    const v = viewOf([], home)
    expect(v.center).toEqual(home)
    expect(v.radiusM).toBe(250)
  })
  it('遠くまで晴れていれば半径が広がる。ただし 1100m まで', () => {
    const far = { ...cellOf({ lat: home.lat + 0.01, lng: home.lng }), at: 0 } // 約 1.1km 北
    expect(viewOf([far], home).radiusM).toBeLessThanOrEqual(1100)
    const near = { ...cellOf({ lat: home.lat + 0.004, lng: home.lng }), at: 0 } // 約 450m 北
    const r = viewOf([near], home).radiusM
    expect(r).toBeGreaterThan(400)
    expect(r).toBeLessThan(500)
  })
  it('自宅が無ければ、晴れた場所の真ん中を中心にする', () => {
    const a = { ...cellOf({ lat: 35.65, lng: 139.63 }), at: 0 }
    const b = { ...cellOf({ lat: 35.66, lng: 139.65 }), at: 0 }
    const v = viewOf([a, b], null)
    expect(v.center.lat).toBeCloseTo(35.655, 2)
    expect(v.center.lng).toBeCloseTo(139.64, 2)
  })
})

describe('zoomFor', () => {
  it('半径が大きいほどズームは小さい（遠くまで入れる）', () => {
    expect(zoomFor(1000, 360, 35.65)).toBeLessThan(zoomFor(300, 360, 35.65))
  })
  it('MapLibre（512px のタイル）で、半径の 1.15 倍が幅の半分に入る', () => {
    const z = zoomFor(400, 360, 35)
    expect(metersPerPixel(z, 35) * 180).toBeCloseTo(400 * 1.15, 3)
  })
  it('13〜17 の範囲に収まる', () => {
    expect(zoomFor(100000, 360, 35)).toBe(13)
    expect(zoomFor(1, 360, 35)).toBe(17)
  })
})

it('clearedBox: 晴れた場所のまわり（＋120m）の四角。遠すぎる点は入れない', () => {
  const o = { lat: 35.65, lng: 139.63 }
  const b = clearedBox([o, { lat: 35.65 + 0.009, lng: 139.63 }, { lat: 34.7, lng: 135.5 }], o, 3000)!
  expect(b.x0).toBeCloseTo(-120, 0)
  expect(b.y1).toBeGreaterThan(1000)
  expect(b.y1).toBeLessThan(1200)
  expect(inBox({ x: 0, y: 500 }, b)).toBe(true)
  expect(inBox({ x: 500, y: 0 }, b)).toBe(false)
  expect(clearedBox([{ lat: 34.7, lng: 135.5 }], o, 3000)).toBeNull()
})
