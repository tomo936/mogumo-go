import { expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { createShopPins, PIN_LAYER, PIN_LAYER_FOG, PIN_SOURCE } from './shopPins.ts'

const me = { lat: 35, lng: 139 }
const shop = { id: 'a', model: 'ramen', lat: 35, lng: 139 }

function fake() {
  const setData = vi.fn()
  const images = new Set<string>()
  const map = {
    addSource: vi.fn(), addLayer: vi.fn(), removeLayer: vi.fn(), removeSource: vi.fn(), removeImage: vi.fn(),
    getLayer: vi.fn(() => ({})), getSource: vi.fn(() => ({ setData })),
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string) => { images.add(id) }),
    loadImage: vi.fn(() => Promise.resolve({ data: {} })),
    queryRenderedFeatures: vi.fn(() => [] as unknown[]),
  }
  return { map, setData, m: map as unknown as MapLibreMap }
}

test('attach で source・2つの層・13種の絵を登録する（層の位置は引数どおり）', async () => {
  const { map, m } = fake()
  const pins = createShopPins(m)
  pins.attach('fog', 'me')
  expect(map.addSource).toHaveBeenCalledWith(PIN_SOURCE, expect.objectContaining({ type: 'geojson' }))
  expect(map.addLayer.mock.calls.map((c) => [(c[0] as { id: string }).id, c[1]])).toEqual([[PIN_LAYER, 'fog'], [PIN_LAYER_FOG, 'me']])
  await Promise.resolve()
  await Promise.resolve()
  expect(map.addImage).toHaveBeenCalledTimes(13)
  expect(map.addImage).toHaveBeenCalledWith('pin-ramen', expect.anything())
  pins.attach('x', 'y') // 2回目は何もしない
  expect(map.addLayer).toHaveBeenCalledTimes(2)
})

test('update は attach 後に source へ流し、attach 前の分は attach で渡る', () => {
  const { map, setData, m } = fake()
  const pins = createShopPins(m)
  pins.update([shop], new Set(), me)
  expect(setData).not.toHaveBeenCalled()
  pins.attach()
  expect((map.addSource.mock.calls[0][1] as { data: { features: unknown[] } }).data.features).toHaveLength(1)
  pins.update([shop, { ...shop, id: 'b' }], new Set(['b']), me)
  expect(setData).toHaveBeenCalledTimes(1)
})

test('pick は雲の上の層を先に見て、押した周りの箱で探し、無ければ null', () => {
  const { map, m } = fake()
  const pins = createShopPins(m)
  expect(pins.pick({ x: 10, y: 10 })).toBeNull() // attach 前
  pins.attach()
  expect(pins.pick({ x: 10, y: 10 })).toBeNull()
  map.queryRenderedFeatures.mockReturnValueOnce([{ properties: { id: 'a' } }])
  expect(pins.pick({ x: 10, y: 10 })).toEqual(['a'])
  expect(map.queryRenderedFeatures).toHaveBeenLastCalledWith([[2, 2], [18, 18]], { layers: [PIN_LAYER_FOG, PIN_LAYER] })
})

test('dispose で層・source・絵を外す', () => {
  const { map, m } = fake()
  const pins = createShopPins(m)
  pins.attach()
  pins.dispose()
  expect(map.removeLayer).toHaveBeenCalledTimes(2)
  expect(map.removeSource).toHaveBeenCalledWith(PIN_SOURCE)
})
