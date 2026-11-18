import { describe, expect, it } from 'vitest'
import { boxCenter, zoomForBox } from './box.ts'

describe('box', () => {
  it('中心', () => {
    expect(boxCenter({ minLat: 35, maxLat: 36, minLng: 139, maxLng: 140 })).toEqual({ lat: 35.5, lng: 139.5 })
  })
  it('0.01 度四方は 13〜17 に収まる', () => {
    const z = zoomForBox({ minLat: 35, maxLat: 35.01, minLng: 139, maxLng: 139.01 }, 390, 844, 13, 17)
    expect(z).toBeGreaterThanOrEqual(13)
    expect(z).toBeLessThanOrEqual(17)
  })
  it('日本全体級は min に張り付く', () => {
    expect(zoomForBox({ minLat: 24, maxLat: 46, minLng: 123, maxLng: 146 }, 390, 844, 13, 17)).toBe(13)
  })
  it('小さい四角は max に張り付く', () => {
    expect(zoomForBox({ minLat: 35, maxLat: 35.0001, minLng: 139, maxLng: 139.0001 }, 390, 844, 13, 17)).toBe(17)
  })
})
