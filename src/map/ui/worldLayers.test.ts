import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Shop } from '../../shops/domain/shop.ts'
import type { PlacedShop } from '../../shops/infra/shopLayer.ts'
import type { LatLng } from '../domain/geo.ts'

const fogLayer = { id: 'fog', setClumps: vi.fn() }
const shopLayer = { id: 'shops-3d', setShops: vi.fn() }
vi.mock('../../fog/infra/fogLayer.ts', () => ({ createFogLayer: () => fogLayer }))
vi.mock('../../shops/infra/shopLayer.ts', () => ({ createShopLayer: () => shopLayer }))

import { attachWorld } from './worldLayers.ts'

const M = 111195 // 1度あたりのm（緯度）
const home: LatLng = { lat: 35.68, lng: 139.76 }
const north = (m: number): LatLng => ({ lat: home.lat + m / M, lng: home.lng })
const LNG_M = M * Math.cos((home.lat * Math.PI) / 180)
// 自宅から東 x m・北 y m の [lng, lat]
const ll = (x: number, y: number): [number, number] => [home.lng + x / LNG_M, home.lat + y / M]
const shop: Shop = { id: 's1', name: 'a', lat: home.lat + 20 / M, lng: home.lng, kind: 'ramen', details: null }
// 店の 5m 北を東西に通る道
const roadFeature = { geometry: { type: 'LineString', coordinates: [ll(-30, 25), ll(30, 25)] }, properties: { class: 'minor' } }
const building = (cx: number, cy: number, w: number, h: number) => ({
  geometry: { type: 'Polygon', coordinates: [[ll(cx - w / 2, cy - h / 2), ll(cx + w / 2, cy - h / 2), ll(cx + w / 2, cy + h / 2), ll(cx - w / 2, cy + h / 2), ll(cx - w / 2, cy - h / 2)]] },
  properties: {},
})
let tiles: Record<string, unknown[]> = {}
const querySourceFeatures = vi.fn((_s: string, o: { sourceLayer: string }) => tiles[o.sourceLayer] ?? [])

let tilesLoaded = true
let idleHandler: (() => void) | null = null
const fakeMap = () => ({
  addLayer: vi.fn(), removeLayer: vi.fn(), getLayer: vi.fn(() => true),
  areTilesLoaded: () => tilesLoaded,
  querySourceFeatures,
  on: vi.fn((_e: string, h: () => void) => { idleHandler = h }),
  off: vi.fn(),
}) as unknown as MapLibreMap
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  tilesLoaded = true
  idleHandler = null
  tiles = { transportation: [roadFeature], building: [] }
})

function setup(over: Partial<Parameters<typeof attachWorld>[1]> = {}) {
  const fetchShops = over.fetchShops ? vi.mocked(over.fetchShops) : vi.fn((_c: LatLng) => Promise.resolve([shop]))
  const onShopsError = vi.fn()
  const map = fakeMap()
  const world = attachWorld(map, { home, shopsEnabled: true, onShopsError, ...over, fetchShops })
  return { world, fetchShops, onShopsError, map }
}

test('最初の位置で霧とお店の層が作られ、fetchShops が現在地で1回呼ばれる', () => {
  const { world, fetchShops, map } = setup()
  world.onPosition(home)
  expect(fogLayer.setClumps).toHaveBeenCalledTimes(1)
  expect(map.addLayer).toHaveBeenCalledTimes(2)
  expect(fetchShops).toHaveBeenCalledTimes(1)
})

test('霧とお店は自分の位置の印より下に入れ、お店は霧より上', () => {
  const { world, map } = setup()
  vi.mocked(map.getLayer).mockImplementation(((id: string) => (id === 'me-circle-line' || id === 'me-shadow' ? {} : undefined)) as never)
  world.onPosition(home)
  expect(vi.mocked(map.addLayer).mock.calls).toEqual([[fogLayer, 'me-circle-line'], [shopLayer, 'me-circle-line']])
})

test('店が何軒あっても、1回の更新でタイルを読むのは道路1回・建物1回', async () => {
  const many = Array.from({ length: 30 }, (_, i): Shop => ({ id: `s${i}`, name: 'a', lat: home.lat + (i * 6) / M, lng: home.lng + 10 / LNG_M, kind: 'cafe', details: null }))
  const { world } = setup({ fetchShops: vi.fn((_c: LatLng) => Promise.resolve(many)) })
  world.onPosition(home)
  await flush()
  expect(vi.mocked(shopLayer.setShops).mock.lastCall![0]).toHaveLength(30)
  expect(querySourceFeatures).toHaveBeenCalledTimes(2)
})

test('同じ建物に2軒あれば、近い方が建物に合わせ、もう1軒は輪郭なしで置く', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, 16, 20, 12)] }
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 14 / M, lng: home.lng - 4 / LNG_M, kind: 'cafe', details: null }
  const b: Shop = { id: 'b', name: 'b', lat: home.lat + 18 / M, lng: home.lng + 5 / LNG_M, kind: 'ramen', details: null }
  const { world } = setup({ fetchShops: vi.fn((_c: LatLng) => Promise.resolve([b, a])) })
  world.onPosition(home)
  await flush()
  const out = vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[]
  const pa = out.find((s) => s.id === 'a')!
  const pb = out.find((s) => s.id === 'b')!
  // a は建物の真ん中（自宅から北 16m）
  expect((pa.lat - home.lat) * M).toBeCloseTo(16, 0)
  expect((pa.lng - home.lng) * LNG_M).toBeCloseTo(0, 0)
  // b は建物の真ん中に重ねず、14m のまま道（北）を向く
  expect(Math.abs((pb.lng - home.lng) * LNG_M - 5)).toBeLessThan(0.5)
  expect(pb.sizeM).toBe(14)
  expect(pb.facingDeg).toBeCloseTo(0, 0)
})

test('400m では再取得せず、520m で2回目。720m で雲の塊を置き直す', async () => {
  const { world, fetchShops } = setup()
  world.onPosition(home)
  await flush()
  world.onPosition(north(400))
  expect(fetchShops).toHaveBeenCalledTimes(1)
  world.onPosition(north(520))
  expect(fetchShops).toHaveBeenCalledTimes(2)
  expect(fogLayer.setClumps).toHaveBeenCalledTimes(1)
  world.onPosition(north(720))
  expect(fogLayer.setClumps).toHaveBeenCalledTimes(2)
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

test('fetchShops が reject すると onShopsError が1回、60秒たてば同じ場所でも再試行', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    const { world, fetchShops, onShopsError } = setup({ fetchShops: vi.fn((_c: LatLng) => Promise.reject(new Error('x'))) })
    world.onPosition(home)
    await flush()
    expect(onShopsError).toHaveBeenCalledTimes(1)
    world.onPosition(north(100))
    world.onPosition(north(600)) // 60秒たつまでは動いても投げない
    expect(fetchShops).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(59000)
    world.onPosition(north(600))
    expect(fetchShops).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    world.onPosition(north(600))
    expect(fetchShops).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
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
  world.onPosition(north(15))
  expect(querySourceFeatures).toHaveBeenCalledTimes(2) // 道路1回・建物1回
})

test('道も建物も無い店は、タイルが読めていれば南向き14mで1回だけ置く', async () => {
  tiles = {}
  const { world } = setup()
  world.onPosition(home)
  await flush()
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([expect.objectContaining({ id: 's1', facingDeg: 180, sizeM: 14 })])
  world.onPosition(north(15))
  world.onPosition(north(30))
  expect(querySourceFeatures).toHaveBeenCalledTimes(2)
})

test('タイル読み込み中は何も覚えず、idle で置く', async () => {
  tilesLoaded = false
  const { world } = setup()
  world.onPosition(home)
  await flush()
  expect(querySourceFeatures).not.toHaveBeenCalled()
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([])
  tilesLoaded = true
  idleHandler!()
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([expect.objectContaining({ id: 's1' })])
})

test('10m 未満の位置更新ではお店を計算し直さない', async () => {
  const { world } = setup()
  world.onPosition(home)
  await flush()
  const n = querySourceFeatures.mock.calls.length
  tilesLoaded = false
  world.onPosition(north(5))
  world.onPosition(north(9))
  expect(querySourceFeatures.mock.calls.length).toBe(n)
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([expect.objectContaining({ id: 's1' })])
})

test('dispose で層を外し、遅れて届いた結果は無視する', async () => {
  let resolve: (s: Shop[]) => void = () => {}
  const { world, map } = setup({ fetchShops: vi.fn((_c: LatLng) => new Promise<Shop[]>((r) => { resolve = r })) })
  world.onPosition(home)
  world.dispose()
  expect(map.removeLayer).toHaveBeenCalledWith('fog')
  expect(map.removeLayer).toHaveBeenCalledWith('shops-3d')
  shopLayer.setShops.mockClear()
  resolve([shop])
  await flush()
  expect(shopLayer.setShops).not.toHaveBeenCalled()
})
