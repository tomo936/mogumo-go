import { describe, expect, it, vi } from 'vitest'
import { extractFeatures, featuresNear } from './mapFeatures.ts'
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
type F = { geometry: GeoJSON.Geometry; properties: Record<string, unknown>; _z?: number }

const features: Record<string, F[]> = {
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
const source = (f: Record<string, F[]>): FeatureSource => ({
  querySourceFeatures: vi.fn((src: string, { sourceLayer }: { sourceLayer: string }) => (src === 'openmaptiles' ? (f[sourceLayer] ?? []) : [])),
})

describe('extractFeatures + featuresNear', () => {
  it('道路と輪郭を m で返し、rail と遠いものは捨てる', () => {
    const near = featuresNear(extractFeatures(source(features), origin, 1000), { x: 0, y: 0 })
    expect(near.roads).toHaveLength(3) // minor, service, primary（rail と遠い線は除く）
    expect(near.footprints).toHaveLength(2)
    expect(near.footprints[0][0].x).toBeCloseTo(15, 0)
    expect(near.footprints[0][0].y).toBeCloseTo(-5, 0)
  })

  it('店の位置へずらして返す（原点から 100m 東の店）', () => {
    const near = featuresNear(extractFeatures(source(features), origin, 1000), { x: 100, y: 0 })
    expect(near.footprints).toHaveLength(1) // 100m 東の建物だけ（20m 東のは 75m 離れる）
    expect(near.footprints[0][0].x).toBeCloseTo(-5, 0)
    expect(near.roads).toHaveLength(1) // 長い primary だけ
  })

  it('extractFeatures の範囲外は捨てる', () => {
    const all = extractFeatures(source(features), origin, 50)
    expect(all.footprints).toHaveLength(2)
    expect(all.roads).toHaveLength(3)
  })

  it('同じ所に複数の輪郭があれば、ズームの大きいタイルのものを先に返す', () => {
    const src = source({
      building: [
        { geometry: { type: 'Polygon', coordinates: [sq(0, 0, 12)] }, properties: {}, _z: 13 },
        { geometry: { type: 'Polygon', coordinates: [sq(0, 0, 6)] }, properties: {}, _z: 14 },
      ],
    })
    const near = featuresNear(extractFeatures(src, origin, 1000), { x: 0, y: 0 })
    expect(near.footprints[0][0].x).toBeCloseTo(-6, 0)
  })

  it('タイルは1回だけ読み、店の数に比例して読み直さない（1回の更新で道路1回・建物1回）', () => {
    // 1タイル分くらいの量: 道路 3000 本・建物 6000 棟
    const many: Record<string, F[]> = { transportation: [], building: [] }
    for (let i = 0; i < 3000; i++) many.transportation.push(line('minor', [d(-700 + (i % 60) * 25, -700 + i / 2), d(-680 + (i % 60) * 25, -700 + i / 2)]))
    for (let i = 0; i < 6000; i++) many.building.push({ geometry: { type: 'Polygon', coordinates: [sq(-700 + (i % 80) * 18, -700 + Math.floor(i / 80) * 18, 6)] }, properties: {} })
    const src = source(many)
    const t0 = performance.now()
    const all = extractFeatures(src, origin, 1060)
    const tExtract = performance.now() - t0
    const t1 = performance.now()
    for (let s = 0; s < 30; s++) featuresNear(all, { x: -600 + s * 40, y: -600 + s * 40 })
    const tPerShop = (performance.now() - t1) / 30
    expect(src.querySourceFeatures).toHaveBeenCalledTimes(2)
    // 店ごとの選び出しは、全部を読み直すより十分に軽い
    expect(tPerShop).toBeLessThan(Math.max(tExtract / 3, 5))
  })
})
