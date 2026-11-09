import { describe, expect, it } from 'vitest'
import { bobAmount, heightMeters, metersPerPixel } from './avatar3d.ts'

describe('metersPerPixel', () => {
  it('ズームが1つ上がると半分', () => {
    expect(metersPerPixel(17, 35)).toBeCloseTo(metersPerPixel(16, 35) / 2, 6)
  })
  it('東京（北緯35度）のズーム17は約 0.98m/px', () => {
    expect(metersPerPixel(17, 35)).toBeCloseTo(0.98, 2)
  })
})

describe('heightMeters', () => {
  it('2D の高さ 40px と同じ見た目の大きさになる（m = px × m/px）', () => {
    expect(heightMeters(40, 17, 35)).toBeCloseTo(40 * metersPerPixel(17, 35), 6)
  })
})

describe('bobAmount', () => {
  it('揺れは ±0.02 の中に収まる', () => {
    for (let t = 0; t < 3000; t += 37) expect(Math.abs(bobAmount(t))).toBeLessThanOrEqual(0.02 + 1e-9)
  })
  it('周期 1200ms で元に戻る', () => {
    expect(bobAmount(333)).toBeCloseTo(bobAmount(1533), 9)
  })
})
