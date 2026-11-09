import { expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { iconSizeAt, liftOffsetAt, createShopPins, PIN_LAYER, PIN_LAYER_FOG, PIN_SOURCE } from './shopPins.ts'

vi.mock('./checkBadge.ts', () => ({ checkBadgeImage: () => ({ width: 1, height: 1 }) }))
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
    queryRenderedFeatures: vi.fn(() => [] as unknown[]), setLayoutProperty: vi.fn(),
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
  expect(map.addImage).toHaveBeenCalledTimes(26) // 13種 × （ふつう・済み）
  expect(map.addImage).toHaveBeenCalledWith('pin-ramen', expect.anything())
  expect(map.addImage).toHaveBeenCalledWith('pin-ramen-done', expect.anything())
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

test('ピンは屋根の少し上へ: ズーム17.5 で約30px、ズームが1上がると約2倍（icon-size 倍を考慮）', () => {
  const px = (z: number) => -liftOffsetAt(z)[1] * iconSizeAt(z)
  expect(px(17.5)).toBeCloseTo(30, 0)
  expect(px(18.5) / px(17.5)).toBeCloseTo(2, 1)
  expect(px(16.5) / px(17.5)).toBeCloseTo(0.5, 1)
  expect(liftOffsetAt(17)[0]).toBe(0) // 真上にだけずらす
})

test('層に icon-offset と済み用の icon-image が付く', () => {
  const { map, m } = fake()
  createShopPins(m).attach()
  const layout = (map.addLayer.mock.calls[0][0] as { layout: Record<string, unknown> }).layout
  expect(layout['icon-offset']).toBeDefined()
  expect(JSON.stringify(layout['icon-image'])).toContain('-done')
})

test('setVisible で2層とも切りかえ、隠している間は pick も null。attach 前の指定も効く', () => {
  const { map, m } = fake()
  const pins = createShopPins(m)
  pins.setVisible(false)
  pins.attach()
  expect((map.addLayer.mock.calls[0][0] as { layout: { visibility: string } }).layout.visibility).toBe('none')
  expect(pins.pick({ x: 1, y: 1 })).toBeNull()
  expect(map.queryRenderedFeatures).not.toHaveBeenCalled()
  pins.setVisible(true)
  expect(map.setLayoutProperty.mock.calls.map((c) => [c[0], c[2]])).toEqual([[PIN_LAYER, 'visible'], [PIN_LAYER_FOG, 'visible']])
})
