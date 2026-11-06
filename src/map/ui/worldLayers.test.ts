import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Shop } from '../../shops/domain/shop.ts'
import type { LatLng } from '../domain/geo.ts'

const sea = { update: vi.fn(), remove: vi.fn() }
const cloudLayer = { id: 'fog-clouds', setSpots: vi.fn() }
const shopLayer = { id: 'shops-3d', setShops: vi.fn() }
vi.mock('../../fog/infra/seaLayer.ts', () => ({ addSea: vi.fn(() => sea) }))
vi.mock('../../fog/infra/cloudLayer.ts', () => ({ createCloudLayer: () => cloudLayer }))
vi.mock('../../shops/infra/shopLayer.ts', () => ({ createShopLayer: () => shopLayer }))
const features = vi.fn()
vi.mock('../../shops/infra/mapFeatures.ts', () => ({ roadsAndFootprints: (...a: unknown[]) => features(...a) }))

import { addSea } from '../../fog/infra/seaLayer.ts'
import { attachWorld } from './worldLayers.ts'

const M = 111195 // 1度あたりのm（緯度）
const home: LatLng = { lat: 35.68, lng: 139.76 }
const north = (m: number): LatLng => ({ lat: home.lat + m / M, lng: home.lng })
const shop: Shop = { id: 's1', name: 'a', lat: home.lat + 20 / M, lng: home.lng, kind: 'ramen' }
const road = [{ x: -10, y: 5 }, { x: 10, y: 5 }]

const fakeMap = () => ({ addLayer: vi.fn(), removeLayer: vi.fn(), getLayer: vi.fn(() => true) }) as unknown as MapLibreMap
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  features.mockReturnValue({ roads: [road], footprints: [] })
})

function setup(over: Partial<Parameters<typeof attachWorld>[1]> = {}) {
  const fetchShops = over.fetchShops ? vi.mocked(over.fetchShops) : vi.fn((_c: LatLng) => Promise.resolve([shop]))
  const onShopsError = vi.fn()
  const map = fakeMap()
  const world = attachWorld(map, { home, shopsEnabled: true, onShopsError, ...over, fetchShops })
  return { world, fetchShops, onShopsError, map }
}

test('最初の位置で雲海・雲・お店の層が作られ、fetchShops が現在地で1回呼ばれる', () => {
  const { world, fetchShops, map } = setup()
  world.onPosition(home)
  expect(addSea).toHaveBeenCalledTimes(1)
  expect(cloudLayer.setSpots).toHaveBeenCalledTimes(1)
  expect(map.addLayer).toHaveBeenCalledTimes(2)
  expect(fetchShops).toHaveBeenCalledTimes(1)
})

test('400m では再取得せず、520m で2回目。720m で雲海と雲を作り直す', async () => {
  const { world, fetchShops } = setup()
  world.onPosition(home)
  await flush()
  world.onPosition(north(400))
  expect(fetchShops).toHaveBeenCalledTimes(1)
  expect(sea.update).not.toHaveBeenCalled()
  world.onPosition(north(520))
  expect(fetchShops).toHaveBeenCalledTimes(2)
  expect(sea.update).not.toHaveBeenCalled()
  world.onPosition(north(720))
  expect(sea.update).toHaveBeenCalledTimes(1)
  expect(cloudLayer.setSpots).toHaveBeenCalledTimes(2)
})

test('取得中は2本目を投げない', async () => {
  let resolve: (s: Shop[]) => void = () => {}
  const { world, fetchShops } = setup({ fetchShops: vi.fn((_c: LatLng) => new Promise<Shop[]>((r) => { resolve = r })) })
  world.onPosition(home)
  world.onPosition(north(600))
  expect(fetchShops).toHaveBeenCalledTimes(1)
  resolve([])
  await flush()
  world.onPosition(north(620))
  expect(fetchShops).toHaveBeenCalledTimes(2)
})

test('home が null でも例外なく、建物は0軒', async () => {
  const { world, onShopsError } = setup({ home: null })
  expect(() => world.onPosition(home)).not.toThrow()
  await flush()
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([])
  expect(onShopsError).not.toHaveBeenCalled()
})

test('shopsEnabled: false では fetchShops を呼ばない', () => {
  const { world, fetchShops } = setup({ shopsEnabled: false })
  world.onPosition(home)
  expect(fetchShops).not.toHaveBeenCalled()
})

test('fetchShops が reject すると onShopsError が1回、500m 動けば再試行', async () => {
  const { world, fetchShops, onShopsError } = setup({ fetchShops: vi.fn((_c: LatLng) => Promise.reject(new Error('x'))) })
  world.onPosition(home)
  await flush()
  expect(onShopsError).toHaveBeenCalledTimes(1)
  world.onPosition(north(100))
  expect(fetchShops).toHaveBeenCalledTimes(1)
  world.onPosition(north(520))
  expect(fetchShops).toHaveBeenCalledTimes(2)
})

test('fetchShops には現在地が渡り、自宅は渡らない', () => {
  const { world, fetchShops } = setup()
  const p = north(300)
  world.onPosition(p)
  expect(fetchShops).toHaveBeenCalledWith(p)
})

test('晴れた所のお店が建物として置かれ、置き方は店ごとに1回だけ計算する', async () => {
  const { world } = setup()
  world.onPosition(home)
  await flush()
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([expect.objectContaining({ id: 's1', kind: 'ramen' })])
  world.onPosition(north(5))
  expect(features).toHaveBeenCalledTimes(1)
})

test('タイルが無い(道も建物も空)間は建物を出さず、次の更新でやり直す', async () => {
  features.mockReturnValue({ roads: [], footprints: [] })
  const { world } = setup()
  world.onPosition(home)
  await flush()
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([])
  features.mockReturnValue({ roads: [road], footprints: [] })
  world.onPosition(north(5))
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([expect.objectContaining({ id: 's1' })])
})

test('dispose で層を外し、遅れて届いた結果は無視する', async () => {
  let resolve: (s: Shop[]) => void = () => {}
  const { world, map } = setup({ fetchShops: vi.fn((_c: LatLng) => new Promise<Shop[]>((r) => { resolve = r })) })
  world.onPosition(home)
  world.dispose()
  expect(sea.remove).toHaveBeenCalled()
  expect(map.removeLayer).toHaveBeenCalledWith('fog-clouds')
  expect(map.removeLayer).toHaveBeenCalledWith('shops-3d')
  shopLayer.setShops.mockClear()
  resolve([shop])
  await flush()
  expect(shopLayer.setShops).not.toHaveBeenCalled()
})
