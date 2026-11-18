import { MercatorCoordinate } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { modelMatrix } from './threeLayer.ts'

describe('modelMatrix', () => {
  const origin = { lat: 35.7029, lng: 139.58 }
  const mc = MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0)

  it('16要素で、原点を入れると平行移動が原点のメルカトル座標になる', () => {
    const m = modelMatrix(origin, origin, 1, 0)
    expect(m).toHaveLength(16)
    expect(m[12]).toBeCloseTo(mc.x, 12)
    expect(m[13]).toBeCloseTo(mc.y, 12)
    expect(m[14]).toBeCloseTo(mc.z, 12)
  })

  it('scale は 1m のメルカトル単位 × scale で入る', () => {
    const m = modelMatrix(origin, origin, 3, 0)
    const s = mc.meterInMercatorCoordinateUnits() * 3
    expect(m[0]).toBeCloseTo(s, 15)
    expect(Math.hypot(m[4], m[5], m[6])).toBeCloseTo(s, 15)
    expect(Math.hypot(m[8], m[9], m[10])).toBeCloseTo(s, 15)
  })
})
