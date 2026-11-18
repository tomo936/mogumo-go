import { expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { iconSizeAt, liftOffsetAt, createShopPins, pinLayerFeatures, PIN_LAYER, PIN_SOURCE } from './shopPins.ts'
import type { ClusterFeature } from '../domain/cluster.ts'
import { pinFeatures } from '../domain/pinFeatures.ts'

vi.mock('./checkBadge.ts', () => ({ checkBadgeImage: () => ({ width: 1, height: 1 }), revealBadgeImage: () => ({ width: 1, height: 1 }) }))
vi.mock('./shopClusters.ts', () => ({ createClusterImages: () => ({ dispose: vi.fn() }) }))
const me = { lat: 35, lng: 139 }
const shop = { id: 'a', model: 'ramen', lat: 35, lng: 139 }

function fake(zoom = 17.5) {
  const setData = vi.fn()
  const images = new Set<string>()
  const handlers: Record<string, (() => void)[]> = {}
  const map = {
    zoom,
    getZoom: () => map.zoom,
    on: (ev: string, fn: () => void) => { (handlers[ev] ??= []).push(fn) },
    off: vi.fn(),
    easeTo: vi.fn(),
    addSource: vi.fn(), addLayer: vi.fn(), removeLayer: vi.fn(), removeSource: vi.fn(), removeImage: vi.fn(),
    getLayer: vi.fn(() => ({})), getSource: vi.fn(() => ({ setData })),
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string) => { images.add(id) }),
    loadImage: vi.fn(() => Promise.resolve({ data: {} })),
    queryRenderedFeatures: vi.fn(() => [] as unknown[]), setLayoutProperty: vi.fn(),
  }
  return { map, setData, handlers, m: map as unknown as MapLibreMap }
}
const lastData = (setData: ReturnType<typeof vi.fn>) => (setData.mock.calls.at(-1)?.[0] as { features: { properties: Record<string, unknown> }[] } | undefined)?.features ?? []

// 経堂のまわりに近いお店を並べる（引きでまとまる近さ）
const cf = (id: string, dLng: number): ClusterFeature => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [139.6363 + dLng, 35.6513] },
  properties: { id, kind: 'ramen', n: 1, done: id === 'c' ? 1 : 0, ids: id, liftTier: 'mid', lt: id === 'c' ? 2 : 1 },
})
const near = [cf('a', 0), cf('b', 0.0001), cf('c', 0.0002)]
const far = cf('far', 0.05) // 遠く離れた 1 軒

test('attach で source と 1 つの層をいちばん上に入れ、18 種＋気配の絵を登録する', async () => {
  const { map, m } = fake()
  const pins = createShopPins(m)
  pins.attach()
  expect(map.addSource).toHaveBeenCalledWith(PIN_SOURCE, expect.objectContaining({ type: 'geojson' }))
  expect(map.addLayer.mock.calls.map((c) => [(c[0] as { id: string }).id, c[1]])).toEqual([[PIN_LAYER, undefined]]) // before なし＝いちばん上
  await Promise.resolve()
  await Promise.resolve()
  expect(map.addImage).toHaveBeenCalledWith('pin-ramen', expect.anything())
  expect(map.addImage).toHaveBeenCalledWith('pin-ramen-done', expect.anything())
  expect(map.addImage).toHaveBeenCalledWith('hint', expect.anything())
  expect(map.addImage).toHaveBeenCalledWith('hint-revealed', expect.anything())
  pins.attach() // 2回目は何もしない
  expect(map.addLayer).toHaveBeenCalledTimes(1)
})

test('引き（倍率 17 未満）: 近いお店はまとめのピン 1 つ（数と済みと高さの段）、離れた 1 軒はそのお店のピン', () => {
  const f = pinLayerFeatures(16.5, [], [...near, far], [])
  const cluster = f.find((x) => x.properties.t === 'cluster')!
  expect(cluster.properties).toMatchObject({ n: 3, lt: 2 })
  expect(f.filter((x) => x.properties.t === 'shop').map((x) => x.properties.id)).toEqual(['far'])
})

test('引きでも、霧の中の近いお店は単独で出す。晴れた所の 1 軒ピン（singles）はまとめ側に任せて出さない', () => {
  const singles = pinFeatures([shop, { ...shop, id: 'fog1' }], new Set(['fog1']), me)
  const f = pinLayerFeatures(16.5, singles, [], [])
  expect(f.map((x) => x.properties.id)).toEqual(['fog1'])
})

test('まとめた結果が 2 軒なら、数字ではなく 2 本のピン（それぞれの場所）', () => {
  const pair = [cf('p', 0), cf('q', 0.0002)]
  const f = pinLayerFeatures(16.5, [], pair, [])
  expect(f.map((x) => [x.properties.t, x.properties.id]).sort()).toEqual([['shop', 'p'], ['shop', 'q']])
})

test('2 軒入りのビルがぽつんとあるときは、ビルの所に 2 本を左右に並べる（中のお店の種類）', () => {
  const b = cf('bld', 0.05)
  const lone2 = { ...b, properties: { ...b.properties, id: 'bld', n: 2, ids: 'x,y', done: 0, kinds: 'sushi,cafe', dones: '1,0' } }
  const f = pinLayerFeatures(17.3, [], [lone2], [])
  expect(f.map((x) => [x.properties.t, x.properties.id, x.properties.kind, x.properties.done, x.properties.side])).toEqual([
    ['shop', 'x', 'sushi', true, 'l'], ['shop', 'y', 'cafe', false, 'r'],
  ])
})

test('近くに何もないビル（3 軒以上の 1 つの点）は、そのビルの数のまとめのピン', () => {
  const lone = { ...cf('bld', 0.05), properties: { ...cf('bld', 0.05).properties, id: 'bld', n: 6, ids: 'a,b,c,d,e,f', done: 0 } }
  const f = pinLayerFeatures(17.3, [], [lone], [])
  expect(f.map((x) => [x.properties.t, x.properties.n])).toEqual([['cluster', 6]])
})

test('倍率 17〜17.7 は小さくまとめる（16 の段ではまとまる少し離れた 3 軒が、17 の段では別々）', () => {
  const pair = [cf('p', 0), cf('q', 0.0006), cf('r', 0.0012)] // 約 55m おき（倍率 16 で約 56px、17 で約 112px）
  expect(pinLayerFeatures(16.5, [], pair, []).filter((x) => x.properties.t === 'cluster')).toHaveLength(1)
  expect(pinLayerFeatures(17.3, [], pair, []).filter((x) => x.properties.t === 'cluster')).toHaveLength(0)
})

test('施設・駅は倍率 17 から前の表記（HTML のピンの列と「6/6」）なので、まとめに入れない。16〜17 はまとめに入る（2026-11-16 オーナー）', () => {
  const fac = { ...cf('fac', 0.00005), properties: { ...cf('fac', 0.00005).properties, id: 'fac', n: 6, ids: 'f1,f2,f3,f4,f5,f6', fac: 1 } }
  const at16 = pinLayerFeatures(16.5, [], [...near, fac], [])
  expect(at16.filter((x) => x.properties.t === 'cluster').map((x) => x.properties.n)).toEqual([9])
  const at17 = pinLayerFeatures(17.3, [], [...near, fac], [])
  expect(at17.some((x) => String(x.properties.ids ?? x.properties.id).includes('f1'))).toBe(false)
  expect(at17.filter((x) => x.properties.t === 'cluster').map((x) => x.properties.n)).toEqual([3])
})

test('寄り（17.7 以上）: まとめず、1 軒ずつ（晴れた所も霧の中も）', () => {
  const singles = pinFeatures([shop, { ...shop, id: 'fog1' }], new Set(['fog1']), me)
  const f = pinLayerFeatures(17.8, singles, near, [])
  expect(f.map((x) => [x.properties.t, x.properties.id])).toEqual([['shop', 'a'], ['shop', 'fog1']])
})

test('気配のピンは、どの倍率でも同じ層に単独で入る（正体が分かった印・弾み）', () => {
  const hints = [{ id: 'h1', lat: 35.65, lng: 139.63, revealed: false }, { id: 'h2', lat: 35.66, lng: 139.64, revealed: true }]
  for (const z of [16.5, 17.5]) {
    const f = pinLayerFeatures(z, [], near, hints, new Map([['h1', 1.2]]))
    expect(f.filter((x) => x.properties.t === 'hint').map((x) => [x.properties.id, x.properties.revealed, x.properties.b])).toEqual([['h1', false, 1.2], ['h2', true, 1]])
  }
})

test('段をまたぐと作り直す（またがなければ作り直さない）', () => {
  const { setData, handlers, map, m } = fake(17.9)
  const pins = createShopPins(m)
  pins.attach()
  pins.setClusterInput(near)
  const n = setData.mock.calls.length
  map.zoom = 17.8
  handlers.zoom.forEach((h) => h())
  expect(setData.mock.calls.length).toBe(n)
  map.zoom = 16.6
  handlers.zoom.forEach((h) => h())
  expect(setData.mock.calls.length).toBe(n + 1)
  expect(lastData(setData).some((x) => x.properties.t === 'cluster')).toBe(true)
})

test('pick: お店は店の id、気配は hint:<id>、まとめは cluster:<経度>,<緯度>（カメラはそこへ寄せる。動かすのは地図の画面）', () => {
  const { map, m } = fake(16.5)
  const pins = createShopPins(m)
  expect(pins.pick({ x: 10, y: 10 })).toBeNull() // attach 前
  pins.attach()
  expect(pins.pick({ x: 10, y: 10 })).toBeNull()
  map.queryRenderedFeatures.mockReturnValueOnce([{ properties: { t: 'shop', id: 'a' } }])
  expect(pins.pick({ x: 10, y: 10 })).toEqual(['a'])
  expect(map.queryRenderedFeatures).toHaveBeenLastCalledWith([[2, 2], [18, 18]], { layers: [PIN_LAYER] })
  map.queryRenderedFeatures.mockReturnValueOnce([{ properties: { t: 'hint', id: 'h1' } }])
  expect(pins.pick({ x: 10, y: 10 })).toEqual(['hint:h1'])
  map.queryRenderedFeatures.mockReturnValueOnce([{ properties: { t: 'cluster', id: 'cluster:1' }, geometry: { type: 'Point', coordinates: [139.63, 35.65] } }])
  expect(pins.pick({ x: 10, y: 10 })).toEqual(['cluster:139.63,35.65'])
  expect(map.easeTo).not.toHaveBeenCalled() // カメラは地図の画面（MapView）が自分の追いかけを止めてから動かす
})

test('dispose で層・source・絵を外す', () => {
  const { map, m } = fake()
  const pins = createShopPins(m)
  pins.attach()
  pins.dispose()
  expect(map.removeLayer).toHaveBeenCalledWith(PIN_LAYER)
  expect(map.removeSource).toHaveBeenCalledWith(PIN_SOURCE)
})

test('ピンは屋根の少し上へ: ズーム17.5 で 10m なら約30px、ズームが1上がると約2倍（icon-size 倍を考慮）', () => {
  const px = (z: number, m = 10) => -liftOffsetAt(z, m)[1] * iconSizeAt(z)
  expect(px(17.5)).toBeCloseTo(30, 0)
  expect(px(17.5, 19)).toBeGreaterThan(px(17.5, 9))
  expect(px(18.5) / px(17.5)).toBeCloseTo(2, 1)
  expect(px(16.5) / px(17.5)).toBeCloseTo(0.5, 1)
  expect(liftOffsetAt(17, 10)[0]).toBe(0) // 真上にだけずらす
})

test('層: 種類ごとの絵（まとめ・気配・済み）、持ち上げ、重なっても全部、画面の下ほど手前', () => {
  const { map, m } = fake()
  createShopPins(m).attach()
  const layout = (map.addLayer.mock.calls[0][0] as { layout: Record<string, unknown> }).layout
  expect(JSON.stringify(layout['icon-offset'])).toContain('liftTier')
  expect(JSON.stringify(layout['icon-image'])).toContain('-done')
  expect(JSON.stringify(layout['icon-image'])).toContain('cl-')
  expect(JSON.stringify(layout['icon-image'])).toContain('hint-revealed')
  expect(layout['icon-allow-overlap']).toBe(true)
  expect(layout['icon-ignore-placement']).toBe(true)
  expect(layout['symbol-z-order']).toBe('viewport-y')
})

test('setVisible・setMoving で層を切りかえ、隠している間は pick も null。attach 前の指定も効く', () => {
  const { map, m } = fake()
  const pins = createShopPins(m)
  pins.setVisible(false)
  pins.attach()
  expect((map.addLayer.mock.calls[0][0] as { layout: { visibility: string } }).layout.visibility).toBe('none')
  expect(pins.pick({ x: 1, y: 1 })).toBeNull()
  pins.setVisible(true)
  expect(map.setLayoutProperty).toHaveBeenLastCalledWith(PIN_LAYER, 'visibility', 'visible')
  pins.setMoving(true)
  expect(map.setLayoutProperty).toHaveBeenLastCalledWith(PIN_LAYER, 'visibility', 'none')
})
