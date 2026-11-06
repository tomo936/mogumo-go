import { describe, expect, it } from 'vitest'
import { roadsAndFootprints } from './mapFeatures.ts'
import type { FeatureSource } from './mapFeatures.ts'

const origin = { lat: 35, lng: 135 }
const D = 1 / 111195 // 約1m（緯度）
const d = (mx: number, my: number): [number, number] => [135 + mx * D * 1.2208, 35 + my * D]

const line = (cls: string, coords: [number, number][]) => ({
  geometry: { type: 'LineString' as const, coordinates: coords },
  properties: { class: cls },
})
const sq = (cx: number, cy: number, h: number): [number, number][] => [
  d(cx - h, cy - h), d(cx + h, cy - h), d(cx + h, cy + h), d(cx - h, cy + h), d(cx - h, cy - h),
]

const features: Record<string, { geometry: GeoJSON.Geometry; properties: Record<string, unknown> }[]> = {
  transportation: [
    line('minor', [d(-10, 5), d(10, 5)]),
    { geometry: { type: 'MultiLineString', coordinates: [[d(-10, -5), d(10, -5)]] }, properties: { class: 'service' } },
    line('rail', [d(-10, 8), d(10, 8)]),
    line('primary', [d(-500, 40), d(500, 40)]), // 頂点は遠いが線は近い
    line('minor', [d(200, 200), d(300, 200)]), // 遠い
  ],
  building: [
    { geometry: { type: 'Polygon', coordinates: [sq(20, 0, 5)] }, properties: {} },
    { geometry: { type: 'MultiPolygon', coordinates: [[sq(-20, 0, 5)]] }, properties: {} },
    { geometry: { type: 'Polygon', coordinates: [sq(100, 0, 5)] }, properties: {} },
  ],
}
const src: FeatureSource = {
  querySourceFeatures: (source, { sourceLayer }) => (source === 'openmaptiles' ? (features[sourceLayer] ?? []) : []),
}

describe('roadsAndFootprints', () => {
  it('道路と輪郭を m で返し、rail と遠いものは捨てる', () => {
    const { roads, footprints } = roadsAndFootprints(src, origin)
    expect(roads).toHaveLength(3) // minor, service, primary（rail と遠い線は除く）
    expect(footprints).toHaveLength(2)
    expect(footprints[0][0].x).toBeCloseTo(15, 0)
    expect(footprints[0][0].y).toBeCloseTo(-5, 0)
  })
})
