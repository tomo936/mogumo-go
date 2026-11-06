import { describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { distanceMeters } from '../../map/domain/geo.ts'
import { addSea, seaBounds } from './seaLayer.ts'

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

describe('addSea', () => {
  it('beforeId の下に入れ、模様が読めるまでは淡い雲の色で塗り、remove で canvas を空ける', () => {
    const fills: string[] = []
    const ctx = {
      globalCompositeOperation: '', fillStyle: '' as unknown,
      clearRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      fillRect: vi.fn(function (this: { fillStyle: unknown }) { fills.push(String(this.fillStyle)) }),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
    }
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
    // jsdom の Image には decode が無いので、読み込み中のまま止める
    const proto = HTMLImageElement.prototype as { decode?: () => Promise<void> }
    const hadDecode = 'decode' in proto
    const oldDecode = proto.decode
    proto.decode = () => new Promise(() => {})
    let canvas: HTMLCanvasElement | null = null
    const map = {
      addSource: vi.fn((_id: string, src: { canvas: HTMLCanvasElement }) => { canvas = src.canvas }),
      addLayer: vi.fn(), getLayer: vi.fn(() => true), getSource: vi.fn(() => true), removeLayer: vi.fn(), removeSource: vi.fn(),
    } as unknown as MapLibreMap
    try {
      const sea = addSea(map, { lat: 35.7, lng: 139.58 }, new Set(), 'me-circle-fill')
      expect(vi.mocked(map.addLayer).mock.calls[0][1]).toBe('me-circle-fill')
      expect(fills).toEqual(['#f4f8fc'])
      expect(canvas!.width).toBe(2048)
      sea.remove()
      expect(canvas!.width).toBe(0)
      expect(canvas!.height).toBe(0)
    } finally {
      getContext.mockRestore()
      if (hadDecode) proto.decode = oldDecode
      else delete proto.decode
    }
  })
})
