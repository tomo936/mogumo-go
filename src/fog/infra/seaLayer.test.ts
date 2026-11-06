import { describe, expect, it } from 'vitest'
import { distanceMeters } from '../../map/domain/geo.ts'
import { seaBounds } from './seaLayer.ts'

describe('seaBounds', () => {
  const center = { lat: 35.7029, lng: 139.58 }
  const [nw, ne, se, sw] = seaBounds(center, 1500)

  it('北西・北東・南東・南西の順に並ぶ', () => {
    expect(nw[1]).toBeGreaterThan(center.lat)
    expect(nw[0]).toBeLessThan(center.lng)
    expect(ne[1]).toBeGreaterThan(center.lat)
    expect(ne[0]).toBeGreaterThan(center.lng)
    expect(se[1]).toBeLessThan(center.lat)
    expect(se[0]).toBeGreaterThan(center.lng)
    expect(sw[1]).toBeLessThan(center.lat)
    expect(sw[0]).toBeLessThan(center.lng)
  })

  it('中心から東西南北に halfM 離れる', () => {
    const near = (lng: number, lat: number) => Math.abs(distanceMeters(center, { lat, lng }) - 1500)
    expect(near(center.lng, nw[1])).toBeLessThan(1)
    expect(near(center.lng, se[1])).toBeLessThan(1)
    expect(near(ne[0], center.lat)).toBeLessThan(1)
    expect(near(sw[0], center.lat)).toBeLessThan(1)
    expect(nw[1]).toBe(ne[1])
    expect(se[1]).toBe(sw[1])
    expect(nw[0]).toBe(sw[0])
    expect(ne[0]).toBe(se[0])
  })
})
