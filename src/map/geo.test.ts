import { expect, test } from 'vitest'
import { circlePolygon, distanceMeters } from './geo.ts'

const tokyo = { lat: 35.6812, lng: 139.7671 }

test('同じ点の距離は 0', () => {
  expect(distanceMeters(tokyo, tokyo)).toBe(0)
})

test('緯度 0.001 度の差はおよそ 111m', () => {
  const d = distanceMeters(tokyo, { lat: tokyo.lat + 0.001, lng: tokyo.lng })
  expect(Math.abs(d - 111.2)).toBeLessThan(1)
})

test('円の頂点はすべて中心から 50m、輪は閉じている', () => {
  const ring = circlePolygon(tokyo, 50).coordinates[0]
  expect(ring[0]).toEqual(ring[ring.length - 1])
  for (const [lng, lat] of ring) {
    expect(Math.abs(distanceMeters(tokyo, { lat, lng }) - 50)).toBeLessThan(0.5)
  }
})
