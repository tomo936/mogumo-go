import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Shop } from '../../shops/domain/shop.ts'
import type { PlacedShop } from '../../shops/infra/shopLayer.ts'
import type { Cell } from '../../fog/domain/grid.ts'
import { cellOf } from '../../fog/domain/grid.ts'
import type { LatLng } from '../domain/geo.ts'

const fogLayer = { id: 'fog', setClumps: vi.fn(), setThin: vi.fn() }
const shopLayer = { id: 'shops-3d', setShops: vi.fn(), pick: vi.fn(() => null) }
const fogShopLayer = { id: 'shops-3d-fog', setShops: vi.fn(), pick: vi.fn(() => null) } // 霧の中の近い店（雲の上に描く）
vi.mock('../../fog/infra/fogLayer.ts', () => ({ createFogLayer: () => fogLayer }))
vi.mock('../../shops/infra/shopLayer.ts', () => ({ createShopLayer: (id: string) => (id === 'shops-3d' ? shopLayer : fogShopLayer) }))
const pinsUpdate = vi.fn()
const facilityLayer = { id: 'facilities-3d', setFacilities: vi.fn(), pick: vi.fn(() => null) }
vi.mock('../../shops/infra/facilityLayer.ts', () => ({ createFacilityLayer: () => facilityLayer }))
const pinsApi = { attach: vi.fn(), update: vi.fn(), pick: vi.fn(() => null), setVisible: vi.fn(), setMoving: vi.fn(), dispose: vi.fn() }
const buildingApi = { update: pinsUpdate, setHidden: vi.fn(), setMoving: vi.fn(), dispose: vi.fn() }
const userMove = { onChange: null as ((moving: boolean) => void) | null, stop: vi.fn() }
vi.mock('../infra/userMove.ts', () => ({
  watchUserMove: (_m: unknown, onChange: (moving: boolean) => void) => {
    userMove.onChange = onChange
    return userMove.stop
  },
}))
vi.mock('../../shops/infra/shopPins.ts', () => ({ createShopPins: () => pinsApi }))
vi.mock('../../shops/infra/buildingPins.ts', () => ({ createBuildingPins: () => buildingApi }))

vi.mock('../../shops/domain/facility.ts', async (orig) => {
  const a = await orig<typeof import('../../shops/domain/facility.ts')>()
  return { ...a, facilityParts: vi.fn(a.facilityParts) }
})
import { facilityParts } from '../../shops/domain/facility.ts'
vi.mock('../domain/geo.ts', async (orig) => {
  const a = await orig<typeof import('../domain/geo.ts')>()
  return { ...a, distanceMeters: vi.fn(a.distanceMeters) }
})
import { distanceMeters } from '../domain/geo.ts'
import { attachWorld } from './worldLayers.ts'

const M = 111195 // 1度あたりのm（緯度）
const home: LatLng = { lat: 35.68, lng: 139.76 }
const north = (m: number): LatLng => ({ lat: home.lat + m / M, lng: home.lng })
const LNG_M = M * Math.cos((home.lat * Math.PI) / 180)
// 自宅から東 x m・北 y m の [lng, lat]
const ll = (x: number, y: number): [number, number] => [home.lng + x / LNG_M, home.lat + y / M]
const shop: Shop = { id: 's1', name: 'a', lat: home.lat + 20 / M, lng: home.lng, kind: 'ramen', details: null, mapId: null }
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
let moveEndHandler: (() => void) | null = null
let zoom = 16 // カメラ（拡大していないので、詳しい模型はふだん自分の位置だけで選ぶ）
let center: LatLng = { lat: 35.68, lng: 139.76 }
const fakeMap = () => ({
  addLayer: vi.fn(), removeLayer: vi.fn(), getLayer: vi.fn(() => true),
  areTilesLoaded: () => tilesLoaded,
  querySourceFeatures,
  getZoom: () => zoom,
  getCenter: () => center,
  on: vi.fn((e: string, h: () => void) => {
    if (e === 'idle') idleHandler = h
    if (e === 'moveend') moveEndHandler = h
  }),
  off: vi.fn(),
}) as unknown as MapLibreMap
// 道路・建物の読み込み回数（お店の poi 読みは数えない）
const featureReads = () => querySourceFeatures.mock.calls.filter((c) => c[1].sourceLayer !== 'poi').length
const loadProgress = vi.fn(() => Promise.resolve({ cells: [] as Cell[], checkedShopIds: new Set<string>() }))
const flush = () => new Promise((r) => setTimeout(r, 0))
// 次のコマ（requestAnimationFrame）は手で進める
let frames: (() => void)[] = []
const runFrames = (max = 1000) => {
  for (let i = 0; i < max && frames.length; i++) frames.shift()!()
}

beforeEach(() => {
  vi.clearAllMocks()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { frames.push(cb); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', () => { frames = [] })
  vi.spyOn(performance, 'now').mockReturnValue(1000) // 時計は止めておく（置き方の計算が1回で終わる）
  tilesLoaded = true
  idleHandler = null
  moveEndHandler = null
  zoom = 16
  center = home
  tiles = { transportation: [roadFeature], building: [] }
})

function setup(over: Partial<Parameters<typeof attachWorld>[1]> = {}) {
  const fetchHotpepper = over.fetchHotpepper ? vi.mocked(over.fetchHotpepper) : vi.fn((_c: LatLng) => Promise.resolve([shop]))
  const onShopsError = vi.fn()
  const map = fakeMap()
  const world = attachWorld(map, { home, shopsEnabled: true, onShopsError, loadProgress, onPinTap: vi.fn(), ...over, fetchHotpepper })
  return { world, fetchHotpepper, onShopsError, map }
}

test('最初の位置で霧とお店の層が作られ、fetchHotpepper が現在地で1回呼ばれる', () => {
  const { world, fetchHotpepper, map } = setup()
  world.onPosition(home)
  expect(fogLayer.setClumps).toHaveBeenCalledTimes(1)
  expect(map.addLayer).toHaveBeenCalledTimes(4)
  expect(fetchHotpepper).toHaveBeenCalledTimes(1)
})

test('大型施設・お店・霧・霧の中の近い店は自分の位置の印より下に入れ、この順で上に重なる', () => {
  const { world, map } = setup()
  vi.mocked(map.getLayer).mockImplementation(((id: string) => (id === 'me-circle-line' || id === 'me-shadow' ? {} : undefined)) as never)
  world.onPosition(home)
  expect(vi.mocked(map.addLayer).mock.calls).toEqual([[facilityLayer, 'me-circle-line'], [shopLayer, 'me-circle-line'], [fogLayer, 'me-circle-line'], [fogShopLayer, 'me-circle-line']])
})

test('お店のピンは霧の層の手前と自分の印の手前に入れ、1軒の店を渡し、タップはピンを先に見る', async () => {
  const { world, map } = setup()
  vi.mocked(map.getLayer).mockImplementation(((id: string) => (id === 'me-circle-line' ? {} : undefined)) as never)
  world.onPosition(home)
  expect(pinsApi.attach).toHaveBeenCalledWith('fog', 'me-circle-line')
  await flush()
  expect(pinsApi.update).toHaveBeenLastCalledWith([expect.objectContaining({ id: 's1', model: 'ramen' })], expect.any(Set), expect.anything(), expect.any(Set))
  pinsApi.pick.mockReturnValueOnce(['s1'] as never)
  expect(world.pick({ x: 1, y: 1 })).toEqual(['s1'])
  expect(shopLayer.pick).not.toHaveBeenCalled()
})

test('店が何軒あっても、1回の更新でタイルを読むのは道路1回・建物1回', async () => {
  const many = Array.from({ length: 30 }, (_, i): Shop => ({ id: `s${i}`, name: 'a', lat: home.lat + (i * 6) / M, lng: home.lng + 10 / LNG_M, kind: 'cafe', details: null, mapId: null }))
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve(many)) })
  world.onPosition(home)
  await flush()
  expect(vi.mocked(shopLayer.setShops).mock.lastCall![0]).toHaveLength(30)
  expect(featureReads()).toBe(2)
})

test('同じ建物に2軒あれば、ビル1つ（model building・id bldg:a・shopIds [a,b]）を建物の真ん中に置く', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, 16, 20, 12)] }
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 14 / M, lng: home.lng - 4 / LNG_M, kind: 'cafe', details: null, mapId: null }
  const b: Shop = { id: 'b', name: 'b', lat: home.lat + 18 / M, lng: home.lng + 5 / LNG_M, kind: 'ramen', details: null, mapId: null }
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([b, a])) })
  world.onPosition(home)
  await flush()
  const out = vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[]
  expect(out).toHaveLength(1)
  expect(out[0]).toMatchObject({ id: 'bldg:a', model: 'building', shopIds: ['a', 'b'], sizeM: 14 })
  // 建物の真ん中（自宅から北 16m）
  expect((out[0].lat - home.lat) * M).toBeCloseTo(16, 0)
  expect((out[0].lng - home.lng) * LNG_M).toBeCloseTo(0, 0)
  expect(pinsUpdate).toHaveBeenLastCalledWith([{ placed: out[0], shops: [a, b], facility: false, topM: 14 * 1.3, spots: [], label: null }], expect.any(Set))
})

test('組の片方が霧の中なら、見えている1軒はふつうの店', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, 52, 20, 12)] }
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 47 / M, lng: home.lng, kind: 'cafe', details: null, mapId: null }
  const b: Shop = { id: 'b', name: 'b', lat: home.lat + 56 / M, lng: home.lng + 5 / LNG_M, kind: 'ramen', details: null, mapId: null }
  const { world } = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([a, b])) })
  world.onPosition(home)
  await flush()
  const out = vi.mocked(fogShopLayer.setShops).mock.lastCall![0] as PlacedShop[] // 霧の中の近い店なので雲の上の層
  expect(out.map((s) => [s.id, s.model])).toEqual([['a', 'cafe']])
})

test('ビルに入った済みの店は buildingPins に渡り、1軒用のピンには渡らない', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, 16, 20, 12)] }
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 14 / M, lng: home.lng - 4 / LNG_M, kind: 'cafe', details: null, mapId: null }
  const b: Shop = { id: 'b', name: 'b', lat: home.lat + 18 / M, lng: home.lng + 5 / LNG_M, kind: 'ramen', details: null, mapId: null }
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([a, b])), loadProgress: vi.fn(() => Promise.resolve({ cells: [], checkedShopIds: new Set(['a']) })) })
  world.onPosition(home)
  await flush()
  await flush()
  expect(pinsApi.update).toHaveBeenLastCalledWith([], expect.anything(), expect.anything(), expect.any(Set))
  const [blds, checked] = pinsUpdate.mock.lastCall!
  expect(blds).toHaveLength(1)
  expect((checked as Set<string>).has('a')).toBe(true)
})

test('400m では再取得せず、520m で2回目。720m で雲の塊を置き直す', async () => {
  const { world, fetchHotpepper } = setup()
  world.onPosition(home)
  await flush()
  world.onPosition(north(400))
  expect(fetchHotpepper).toHaveBeenCalledTimes(1)
  world.onPosition(north(520))
  expect(fetchHotpepper).toHaveBeenCalledTimes(2)
  expect(fogLayer.setClumps).toHaveBeenCalledTimes(1)
  world.onPosition(north(720))
  expect(fogLayer.setClumps).toHaveBeenCalledTimes(2)
})

test('取得中は2本目を投げない', async () => {
  let resolve: (s: Shop[]) => void = () => {}
  const { world, fetchHotpepper } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => new Promise<Shop[]>((r) => { resolve = r })) })
  world.onPosition(home)
  world.onPosition(north(600))
  expect(fetchHotpepper).toHaveBeenCalledTimes(1)
  resolve([])
  await flush()
  world.onPosition(north(620))
  expect(fetchHotpepper).toHaveBeenCalledTimes(2)
})

test('home が null でも例外なく、霧の中の遠い店は0軒', async () => {
  const far: Shop = { ...shop, id: 'far', lat: home.lat + 100 / M }
  const { world, onShopsError } = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([far])) })
  expect(() => world.onPosition(home)).not.toThrow()
  await flush()
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([])
  expect(onShopsError).not.toHaveBeenCalled()
})

test('shopsEnabled: false では fetchHotpepper を呼ばない', () => {
  const { world, fetchHotpepper } = setup({ shopsEnabled: false })
  world.onPosition(home)
  expect(fetchHotpepper).not.toHaveBeenCalled()
})

test('fetchHotpepper が reject すると onShopsError が1回、60秒たてば同じ場所でも再試行', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    const { world, fetchHotpepper, onShopsError } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.reject(new Error('x'))) })
    world.onPosition(home)
    await flush()
    expect(onShopsError).toHaveBeenCalledTimes(1)
    world.onPosition(north(100))
    world.onPosition(north(600)) // 60秒たつまでは動いても投げない
    expect(fetchHotpepper).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(59000)
    world.onPosition(north(600))
    expect(fetchHotpepper).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    world.onPosition(north(600))
    expect(fetchHotpepper).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})

test('fetchHotpepper には現在地が渡り、自宅は渡らない', () => {
  const { world, fetchHotpepper } = setup()
  const p = north(300)
  world.onPosition(p)
  expect(fetchHotpepper).toHaveBeenCalledWith(p)
})

test('晴れた所のお店が建物として置かれ、置き方は店ごとに1回だけ計算する', async () => {
  const { world } = setup()
  world.onPosition(home)
  await flush()
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([expect.objectContaining({ id: 's1', model: 'ramen', shopIds: ['s1'] })])
  world.onPosition(north(15))
  expect(featureReads()).toBe(2) // 道路1回・建物1回
})

test('道も建物も無い店は、タイルが読めていれば南向き14mで1回だけ置く', async () => {
  tiles = {}
  const { world } = setup()
  world.onPosition(home)
  await flush()
  expect(shopLayer.setShops).toHaveBeenLastCalledWith([expect.objectContaining({ id: 's1', facingDeg: 180, sizeM: 14 })])
  world.onPosition(north(15))
  world.onPosition(north(30))
  expect(featureReads()).toBe(2)
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

test('地図のお店の読み直しは 100m 以上動いたときだけ（10m〜99m では poi を読み直さない）', async () => {
  const { world } = setup()
  world.onPosition(home)
  await flush()
  const n = poiReads()
  for (const m of [15, 40, 80, 99]) world.onPosition(north(m)) // 10m ごとの見える・見えないの更新は走る
  expect(poiReads()).toBe(n)
  world.onPosition(north(110))
  expect(poiReads()).toBe(n + 1)
  world.onPosition(north(150)) // 前回の読み直しからは 40m
  expect(poiReads()).toBe(n + 1)
})

test('dispose で層を外し、遅れて届いた結果は無視する', async () => {
  let resolve: (s: Shop[]) => void = () => {}
  const { world, map } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => new Promise<Shop[]>((r) => { resolve = r })) })
  world.onPosition(home)
  world.dispose()
  expect(map.removeLayer).toHaveBeenCalledWith('fog')
  expect(map.removeLayer).toHaveBeenCalledWith('shops-3d')
  shopLayer.setShops.mockClear()
  resolve([shop])
  await flush()
  expect(shopLayer.setShops).not.toHaveBeenCalled()
})

test('人が地図を動かしている間は、1軒の店のピンとビルのピンを両方隠す。dispose で見張りをやめる', () => {
  const { world } = setup()
  userMove.onChange!(true)
  expect(pinsApi.setMoving).toHaveBeenLastCalledWith(true)
  expect(buildingApi.setMoving).toHaveBeenLastCalledWith(true)
  userMove.onChange!(false)
  expect(pinsApi.setMoving).toHaveBeenLastCalledWith(false)
  expect(buildingApi.setMoving).toHaveBeenLastCalledWith(false)
  world.dispose()
  expect(userMove.stop).toHaveBeenCalled()
})

const poi = (id: number, name: string, x: number, y: number) => ({
  id, geometry: { type: 'Point', coordinates: ll(x, y) }, properties: { subclass: 'cafe', name },
})

test('地図の店とホットペッパーの同じ店は1軒にまとまり、hp: の id になる', async () => {
  tiles = { transportation: [roadFeature], building: [], poi: [poi(7, 'カフェ花', 0, 20)] }
  const hp: Shop = { id: 'hp:J1', name: 'カフェ花', lat: home.lat + 30 / M, lng: home.lng, kind: 'cafe', details: null, mapId: null }
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([hp])) })
  world.onPosition(home)
  expect(vi.mocked(shopLayer.setShops).mock.lastCall![0]).toEqual([expect.objectContaining({ id: 'osm:7' })])
  await flush()
  const out = vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[]
  expect(out).toHaveLength(1)
  expect(out[0].id).toBe('hp:J1')
  expect(world.shopsNear().map((s) => s.id)).toEqual(['hp:J1'])
})

test('ホットペッパーが失敗しても地図の店は出て、onShopsError は1回', async () => {
  tiles = { transportation: [roadFeature], building: [], poi: [poi(7, 'カフェ花', 0, 20)] }
  const { world, onShopsError } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.reject(new Error('x'))) })
  world.onPosition(home)
  await flush()
  expect(onShopsError).toHaveBeenCalledTimes(1)
  expect(vi.mocked(shopLayer.setShops).mock.lastCall![0]).toEqual([expect.objectContaining({ id: 'osm:7' })])
})

test('shopsEnabled: false でも地図の店は出る', () => {
  tiles = { transportation: [roadFeature], building: [], poi: [poi(7, 'カフェ花', 0, 20)] }
  const { world, onShopsError } = setup({ shopsEnabled: false })
  world.onPosition(home)
  expect(vi.mocked(shopLayer.setShops).mock.lastCall![0]).toEqual([expect.objectContaining({ id: 'osm:7' })])
  expect(onShopsError).not.toHaveBeenCalled()
})

const poiReads = () => querySourceFeatures.mock.calls.filter((c) => c[1].sourceLayer === 'poi').length

test('同じ位置で idle が2回来ても、poi を読むのは1回だけ', async () => {
  const { world } = setup()
  world.onPosition(home)
  await flush()
  const n = poiReads()
  idleHandler!()
  idleHandler!()
  expect(poiReads()).toBe(n)
})

test('タイル読み込み中は poi を読まず、読めたあとの idle で読む', async () => {
  tilesLoaded = false
  const { world } = setup()
  world.onPosition(home)
  await flush()
  expect(poiReads()).toBe(0)
  tilesLoaded = true
  idleHandler!()
  expect(poiReads()).toBe(1)
})

test('一度読んだあと、同じ場所でタイルが読み込み直しになったら、読めたあとの idle で poi を読み直す', async () => {
  const { world } = setup()
  world.onPosition(home)
  await flush()
  tilesLoaded = false
  world.onPosition(north(5))
  idleHandler!()
  const n = poiReads()
  tilesLoaded = true
  idleHandler!()
  expect(poiReads()).toBe(n + 1)
})

const far: Shop = { id: 'far', name: 'f', lat: home.lat + 400 / M, lng: home.lng, kind: 'cafe', details: null, mapId: null }

test('loadProgress の晴れたセルにある店が見える', async () => {
  const cell = cellOf(far)
  const { world } = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([far])), loadProgress: vi.fn(() => Promise.resolve({ cells: [cell], checkedShopIds: new Set(['x']) })) })
  world.onPosition(home)
  await flush()
  expect(world.shopsNear().map((s) => s.id)).toEqual(['far'])
  expect(world.checked().has('x')).toBe(true)
})

test('済みの判定は店の id か合体前の地図の id のどちらでもよい', async () => {
  const merged: Shop = { ...far, id: 'hp:M', mapId: 'osm:7' }
  const { world } = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([merged])), loadProgress: vi.fn(() => Promise.resolve({ cells: [cellOf(far)], checkedShopIds: new Set(['osm:7']) })) })
  world.onPosition(home)
  await flush()
  expect(world.checked().has('hp:M')).toBe(true)
  const other = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([merged])) })
  other.world.onPosition(home)
  await flush()
  expect(other.world.checked().has('hp:M')).toBe(false)
  other.world.markChecked('hp:M', 'osm:7')
  expect(other.world.checked()).toEqual(new Set(['hp:M', 'osm:7']))
})

test('loadProgress が失敗しても落ちず、onShopsError も呼ばない', async () => {
  const { world, onShopsError } = setup({ loadProgress: vi.fn(() => Promise.reject(new Error('x'))) })
  world.onPosition(home)
  await flush()
  expect(onShopsError).not.toHaveBeenCalled()
  expect(fogLayer.setClumps).toHaveBeenCalledTimes(1)
})

test('addCleared は新しいセルがあれば波つきで setClumps、空なら何もしない', async () => {
  const { world } = setup()
  world.onPosition(home)
  fogLayer.setClumps.mockClear()
  world.addCleared([], far)
  expect(fogLayer.setClumps).not.toHaveBeenCalled()
  world.addCleared([cellOf(north(300))], north(300))
  expect(fogLayer.setClumps).toHaveBeenCalledTimes(1)
  const cs = fogLayer.setClumps.mock.lastCall![1] as { start: number }[]
  expect(cs.length).toBeGreaterThan(0)
  expect(cs.some((c) => c.start >= 0)).toBe(true)
})

// 波は from から広がる: 変わる塊のうち from に近いものほど start が早い
type AC = { x: number; y: number; start: number }
const waveOrder = (cs: AC[], fx: number, fy: number) => {
  const moving = cs.filter((c) => c.start >= 0).map((c) => ({ d: Math.hypot(c.x - fx, c.y - fy), start: c.start }))
  moving.sort((a, b) => a.d - b.d)
  return { nearest: moving[0], farthest: moving[moving.length - 1] }
}
const cellsAround = (c: LatLng): Cell[] => {
  const o = cellOf(c)
  const out: Cell[] = []
  for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) out.push({ x: o.x + x, y: o.y + y })
  return out
}

test('波は from から広がる（近い塊ほど start が小さい）', () => {
  const { world } = setup()
  world.onPosition(home)
  const from = north(300)
  world.addCleared(cellsAround(from), from)
  const cs = fogLayer.setClumps.mock.lastCall![1] as AC[]
  const o = fogLayer.setClumps.mock.lastCall![0] as LatLng
  const f = { x: (from.lng - o.lng) * LNG_M, y: (from.lat - o.lat) * M }
  const { nearest, farthest } = waveOrder(cs, f.x, f.y)
  expect(nearest.d).toBeLessThan(farthest.d)
  expect(nearest.start).toBeLessThan(farthest.start)
})

test('雲の塊の原点が変わったあとの addCleared でも、from は新しい原点で換算される', () => {
  const { world } = setup()
  world.onPosition(home)
  world.onPosition(north(720)) // 置き直し
  const o2 = fogLayer.setClumps.mock.lastCall![0] as LatLng
  expect(o2.lat).toBeCloseTo(north(720).lat, 6)
  const from = north(900)
  world.addCleared(cellsAround(from), from)
  const cs = fogLayer.setClumps.mock.lastCall![1] as AC[]
  const f = { x: (from.lng - o2.lng) * LNG_M, y: (from.lat - o2.lat) * M }
  const { nearest, farthest } = waveOrder(cs, f.x, f.y)
  expect(nearest.start).toBeLessThan(farthest.start)
})

// 霧の中の店を北 y m に置き、自分は home の北 0m に立つ（home: null で全部が霧の中）
const fogShop = (id: string, dy: number, dx = 0): Shop => ({ id, name: id, lat: home.lat + dy / M, lng: home.lng + dx / LNG_M, kind: 'cafe', details: null, mapId: null })
const withClock = async (shopsIn: Shop[], run: (world: ReturnType<typeof attachWorld>, tick: (ms: number) => void) => void | Promise<void>) => {
  let now = 1000
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now)
  try {
    const { world } = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve(shopsIn)) })
    world.onPosition(home)
    await flush()
    await run(world, (ms) => { now += ms })
  } finally {
    spy.mockRestore()
  }
}

test('薄さは目標へ約3/秒で近づく（100ms で目標の約0.3）', async () => {
  await withClock([fogShop('a', 30)], (world, tick) => {
    tick(0)
    world.onPosition(home) // 距離30m: 目標は最大(1)
    tick(100)
    world.onPosition(home)
    const spots = fogLayer.setThin.mock.lastCall![0] as { amount: number }[]
    expect(spots[0].amount).toBeGreaterThan(0.25)
    expect(spots[0].amount).toBeLessThan(0.35)
  })
})

test('薄くする店は近い4軒まで', async () => {
  const list = [10, 15, 20, 25, 30].map((d, i) => fogShop(`n${i}`, d))
  await withClock(list, (world, tick) => {
    tick(100)
    world.onPosition(home)
    expect(fogLayer.setThin.mock.lastCall![0]).toHaveLength(4)
  })
})

test('晴れたセルの店には薄い所を作らない', async () => {
  const s = fogShop('c', 20)
  await withClock([s], (world, tick) => {
    world.addCleared([cellOf(s)], s)
    tick(100)
    world.onPosition(home)
    expect(fogLayer.setThin.mock.lastCall![0]).toEqual([])
  })
})

test('変化がなければ setThin を送り直さない', async () => {
  await withClock([fogShop('a', 20)], (world, tick) => {
    // 目標に十分近づくまで進める
    for (let i = 0; i < 20; i++) { tick(500); world.onPosition(home) }
    fogLayer.setThin.mockClear()
    tick(16)
    world.onPosition(home)
    tick(16)
    world.onPosition(home)
    expect(fogLayer.setThin).not.toHaveBeenCalled()
  })
})

test('3m 未満の移動では店の全件走査をしない', async () => {
  const many = Array.from({ length: 50 }, (_, i) => fogShop(`m${i}`, 200 + i))
  await withClock(many, (world, tick) => {
    tick(16)
    world.onPosition(home)
    const n0 = vi.mocked(distanceMeters).mock.calls.length
    for (let i = 1; i <= 5; i++) { tick(16); world.onPosition(north(i * 0.5)) }
    expect(vi.mocked(distanceMeters).mock.calls.length - n0).toBeLessThan(50)
  })
})

test('薄くしていた店のセルが晴れたら、0 へなめらかに戻してから外す', async () => {
  const s = fogShop('a', 20)
  await withClock([s], (world, tick) => {
    for (let i = 0; i < 10; i++) { tick(500); world.onPosition(home) }
    const before = (fogLayer.setThin.mock.lastCall![0] as { amount: number }[])[0].amount
    expect(before).toBeGreaterThan(0.9)
    world.addCleared([cellOf(s)], s)
    tick(100)
    world.onPosition(home)
    const mid = fogLayer.setThin.mock.lastCall![0] as { amount: number }[]
    expect(mid).toHaveLength(1) // すぐには消えない
    expect(mid[0].amount).toBeLessThan(before)
    expect(mid[0].amount).toBeGreaterThan(0.5)
    for (let i = 0; i < 20; i++) { tick(500); world.onPosition(home) }
    expect(fogLayer.setThin).toHaveBeenLastCalledWith([])
  })
})

test('霧の中の店が40mにあれば setThin(amount>0)、70mでは setThin([])', async () => {
  let now = 1000
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now)
  try {
    const f: Shop = { ...far, lat: home.lat + 400 / M }
    const { world } = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([f])) })
    world.onPosition(north(360))
    await flush()
    now += 500
    world.onPosition(north(360))
    const spots = fogLayer.setThin.mock.lastCall![0] as { amount: number }[]
    expect(spots).toHaveLength(1)
    expect(spots[0].amount).toBeGreaterThan(0)
    now += 500
    world.onPosition(north(330))
    expect(fogLayer.setThin).toHaveBeenLastCalledWith([])
  } finally {
    spy.mockRestore()
  }
})

test('2,500m² 以上の建物の2軒は大型の施設（facility: true）', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, -10, 60, 50)] }
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 5 / M, lng: home.lng - 4 / LNG_M, kind: 'cafe', details: null, mapId: null }
  const b: Shop = { id: 'b', name: 'b', lat: home.lat - 20 / M, lng: home.lng + 15 / LNG_M, kind: 'ramen', details: null, mapId: null }
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([a, b])) })
  world.onPosition(home)
  await flush()
  const [blds] = pinsUpdate.mock.lastCall!
  expect(blds).toEqual([expect.objectContaining({ facility: true })])
})

const twoIn = (fn: (s: Shop[]) => void) => {
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 5 / M, lng: home.lng - 4 / LNG_M, kind: 'cafe', details: null, mapId: null }
  const b: Shop = { id: 'b', name: 'b', lat: home.lat - 20 / M, lng: home.lng + 15 / LNG_M, kind: 'ramen', details: null, mapId: null }
  fn([a, b])
}
const stationPoi = (x: number, y: number, subclass = 'station') => ({ id: 99, geometry: { type: 'Point', coordinates: ll(x, y) }, properties: { class: 'railway', subclass, name: '駅' } })

test('2,500m² 以上の2軒は facilityLayer に渡り、shopLayer にはビルが出ない', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, -10, 60, 50)] }
  let ab: Shop[] = []
  twoIn((s) => { ab = s })
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve(ab)) })
  world.onPosition(home)
  await flush()
  const facs = facilityLayer.setFacilities.mock.lastCall![0] as { id: string; shopIds: string[]; parts: unknown[] }[]
  expect(facs).toHaveLength(1)
  expect(facs[0].shopIds).toEqual(['a', 'b'])
  expect(facs[0].parts).toHaveLength(1)
  const out = vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[]
  expect(out.filter((s) => s.model === 'building')).toEqual([])
})

const mallPoi = (x: number, y: number, name: string) => ({ id: 98, geometry: { type: 'Point', coordinates: ll(x, y) }, properties: { class: 'shop', subclass: 'department_store', name } })
type Fac = { kind: string; name: string | null; shopIds: string[] }

test('駅の点と百貨店の点が入った大きい建物は、駅（kind station）として1つ、名前は両方', async () => {
  let ab: Shop[] = []
  twoIn((s) => { ab = s })
  tiles = { transportation: [roadFeature], building: [building(0, -10, 60, 50)], poi: [stationPoi(10, -10), mallPoi(-10, -10, '京王百貨店')] }
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve(ab)) })
  world.onPosition(home)
  await flush()
  const facs = facilityLayer.setFacilities.mock.lastCall![0] as Fac[]
  expect(facs.map((f) => [f.kind, f.name])).toEqual([['station', '駅・京王百貨店']])
  expect(world.titleOf(['a', 'b'])).toBe('駅・京王百貨店')
})

test('地下鉄の点は駅にしない（ふつうの大型施設）', async () => {
  let ab: Shop[] = []
  twoIn((s) => { ab = s })
  tiles = { transportation: [roadFeature], building: [building(0, -10, 60, 50)], poi: [stationPoi(10, -10, 'subway')] }
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve(ab)) })
  world.onPosition(home)
  await flush()
  expect((facilityLayer.setFacilities.mock.lastCall![0] as Fac[]).map((f) => f.kind)).toEqual(['facility'])
})

test('2,500m² 未満の建物でも、駅の点があり2軒なら駅として立体にする（ビルにしない）', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, 16, 20, 12)], poi: [stationPoi(0, 16)] }
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 14 / M, lng: home.lng - 4 / LNG_M, kind: 'cafe', details: null, mapId: null }
  const b: Shop = { id: 'b', name: 'b', lat: home.lat + 18 / M, lng: home.lng + 5 / LNG_M, kind: 'ramen', details: null, mapId: null }
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([a, b])) })
  world.onPosition(home)
  await flush()
  expect((facilityLayer.setFacilities.mock.lastCall![0] as Fac[]).map((f) => [f.kind, f.name])).toEqual([['station', '駅']])
  expect(vi.mocked(shopLayer.setShops).mock.lastCall![0]).toEqual([])
})

test('1つの駅の点が2つの建物に入っていたら、大きい方だけが駅', async () => {
  // 小さい建物（20×12、2軒）と、それを含む大きい建物（60×50）が重なる。駅の点は両方の中
  tiles = { transportation: [roadFeature], building: [building(0, 16, 20, 12), building(30, 16, 80, 60)], poi: [stationPoi(0, 16)] }
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 14 / M, lng: home.lng - 4 / LNG_M, kind: 'cafe', details: null, mapId: null }
  const b: Shop = { id: 'b', name: 'b', lat: home.lat + 18 / M, lng: home.lng + 5 / LNG_M, kind: 'ramen', details: null, mapId: null }
  const c: Shop = { id: 'c', name: 'c', lat: home.lat + 30 / M, lng: home.lng + 50 / LNG_M, kind: 'sushi', details: null, mapId: null }
  const d: Shop = { id: 'd', name: 'd', lat: home.lat + 5 / M, lng: home.lng + 55 / LNG_M, kind: 'cafe', details: null, mapId: null }
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([a, b, c, d])) })
  world.onPosition(home)
  await flush()
  const facs = facilityLayer.setFacilities.mock.lastCall![0] as Fac[]
  expect(facs.filter((f) => f.kind === 'station')).toHaveLength(1)
})

test('同じ施設の店が何軒あっても、施設の形の計算は1回', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, -10, 60, 50)] }
  let ab: Shop[] = []
  twoIn((s) => { ab = s })
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve(ab)) })
  world.onPosition(home)
  await flush()
  expect(vi.mocked(facilityParts)).toHaveBeenCalledTimes(1)
})

test('施設の店が1軒だけ見えていても（仲間は霧の中）、施設として facilityLayer に渡る', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, -40, 60, 100)] }
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 5 / M, lng: home.lng, kind: 'cafe', details: null, mapId: null }
  const b: Shop = { id: 'b', name: 'b', lat: home.lat - 80 / M, lng: home.lng, kind: 'ramen', details: null, mapId: null } // 霧の中（80m）
  const { world } = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([a, b])) })
  world.onPosition(home)
  await flush()
  expect(world.shopsNear().map((s) => s.id)).toEqual(['a'])
  const facs = facilityLayer.setFacilities.mock.lastCall![0] as Fac[]
  expect(facs.map((f) => f.shopIds)).toEqual([['a']])
  expect(vi.mocked(shopLayer.setShops).mock.lastCall![0]).toEqual([])
})

test('大きい建物でも、読み込んだ店が全部で1軒なら施設にしない（ふつうの店）', async () => {
  tiles = { transportation: [roadFeature], building: [building(0, -40, 60, 100)] }
  const a: Shop = { id: 'a', name: 'a', lat: home.lat + 5 / M, lng: home.lng, kind: 'cafe', details: null, mapId: null }
  const { world } = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([a])) })
  world.onPosition(home)
  await flush()
  expect(facilityLayer.setFacilities).toHaveBeenLastCalledWith([])
  expect((vi.mocked(fogShopLayer.setShops).mock.lastCall![0] as PlacedShop[]).map((s) => s.id)).toEqual(['a'])
})

// 自宅の北 y m・東 x m の cafe（自宅まわり 200m は晴れ）
const at = (id: string, y: number, x = 0): Shop => ({ id, name: id, lat: home.lat + y / M, lng: home.lng + x / LNG_M, kind: 'cafe', details: null, mapId: null })

test('50軒あれば 50軒とも層に渡る（40軒で切れない）', async () => {
  const many = Array.from({ length: 50 }, (_, i) => at(`s${i}`, 10 + i * 3, (i % 2) * 30 - 15))
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve(many)) })
  world.onPosition(home)
  await flush()
  expect(vi.mocked(shopLayer.setShops).mock.lastCall![0]).toHaveLength(50)
})

test('層に渡る店に「軽い」が付く: 150m 以内は詳しい・それより遠いと軽い', async () => {
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([at('near', 20), at('far', 170)])) })
  world.onPosition(home)
  await flush()
  const out = vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[]
  expect(out.map((s) => [s.id, !!s.light])).toEqual([['near', false], ['far', true]])
})

test('詳しい・軽いの切りかえには余裕があり、切りかえたときだけ層を作り直す', async () => {
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([at('a', 140)])) })
  world.onPosition(home)
  await flush()
  expect((vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[])[0].light).toBeFalsy()
  const n = vi.mocked(shopLayer.setShops).mock.calls.length
  world.onPosition(north(-20)) // 160m: 前回詳しいので詳しいまま
  expect(vi.mocked(shopLayer.setShops).mock.calls.length).toBe(n)
  world.onPosition(north(-45)) // 185m: 軽い
  expect(vi.mocked(shopLayer.setShops).mock.calls.length).toBe(n + 1)
  expect((vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[])[0].light).toBe(true)
  world.onPosition(north(-15)) // 155m: 前回軽いので軽いまま
  expect(vi.mocked(shopLayer.setShops).mock.calls.length).toBe(n + 1)
})

test('霧の中の近い店は雲の上の層、晴れた所の店は雲の下の層に渡る', async () => {
  const fogShop: Shop = { ...at('fog', 0), lat: home.lat - 230 / M } // 自宅の南 230m（霧）
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([at('clear', 20), fogShop])) })
  world.onPosition(north(-200)) // 霧の店から 30m・晴れた店から 220m
  await flush()
  expect((vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[]).map((s) => s.id)).toEqual(['clear'])
  expect((vi.mocked(fogShopLayer.setShops).mock.lastCall![0] as PlacedShop[]).map((s) => s.id)).toEqual(['fog'])
})

test('店の点は晴れたセルでも、模型の中心（輪郭の真ん中）が霧のセルなら出さない', async () => {
  // 輪郭は北 175〜285m（真ん中 230m は霧）。店の点は 180m（晴れ）
  tiles = { transportation: [roadFeature], building: [building(0, 230, 20, 110)] }
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([at('near', 20), at('edge', 180)])) })
  world.onPosition(home)
  await flush()
  expect((vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[]).map((s) => s.id)).toEqual(['near'])
  expect(vi.mocked(fogShopLayer.setShops).mock.lastCall![0]).toEqual([])
})

test('拡大しているとき、カメラが動き終わったらカメラの真ん中から近い店も詳しい模型にする', async () => {
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([at('a', 150)])) })
  world.onPosition(north(-150)) // a まで 300m
  await flush()
  const light = () => (vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[])[0].light
  expect(light()).toBe(true)
  center = north(140)
  moveEndHandler!() // 拡大していない（16）ので変わらない
  expect(light()).toBe(true)
  zoom = 17
  moveEndHandler!()
  expect(light()).toBeFalsy()
  const n = vi.mocked(shopLayer.setShops).mock.calls.length
  center = north(135)
  moveEndHandler!() // 5m しか動いていないので選び直さない
  expect(vi.mocked(shopLayer.setShops).mock.calls.length).toBe(n)
  zoom = 16.5
  moveEndHandler!() // 縮小したら自分の位置だけで選ぶ
  expect(light()).toBe(true)
})

test('タップして選んだ店は遠くても詳しい模型にし、閉じたら戻す', async () => {
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([at('a', 150)])) })
  world.onPosition(north(-150))
  await flush()
  const light = () => (vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[])[0].light
  expect(light()).toBe(true)
  world.focus(['a'])
  expect(light()).toBeFalsy()
  world.focus(null)
  expect(light()).toBe(true)
})

test('たくさんの店は、最初の呼び出しで一部を置き、コマを進めると全部が置かれる', async () => {
  let now = 1000
  vi.mocked(performance.now).mockImplementation(() => (now += 1)) // 呼ぶたびに 1ms 進む
  const many = Array.from({ length: 80 }, (_, i) => at(`s${i}`, 10 + i * 2, (i % 2) * 30 - 15))
  const { world } = setup({ fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve(many)) })
  world.onPosition(home)
  await flush()
  const first = vi.mocked(shopLayer.setShops).mock.lastCall![0] as PlacedShop[]
  expect(first.length).toBeGreaterThan(0)
  expect(first.length).toBeLessThan(80)
  expect(first.map((s) => s.id)).toEqual(many.slice(0, first.length).map((s) => s.id)) // 近い順に出てくる
  expect(frames.length).toBeGreaterThan(0)
  runFrames()
  expect(vi.mocked(shopLayer.setShops).mock.lastCall![0]).toHaveLength(80)
  expect(frames).toHaveLength(0)
})

test('hintInputs は合体済みの店・近い店・晴れたセル・済みの id を返す', async () => {
  const { world } = setup({ home: null, fetchHotpepper: vi.fn((_c: LatLng) => Promise.resolve([far])), loadProgress: vi.fn(() => Promise.resolve({ cells: [cellOf(far)], checkedShopIds: new Set(['x']) })) })
  world.onPosition(home)
  await flush()
  const h = world.hintInputs()
  expect(h.shops.map((s) => s.id)).toEqual(['far'])
  expect(h.near.map((s) => s.id)).toEqual(['far'])
  expect(h.cleared.size).toBeGreaterThan(0)
  expect(h.checked.has('x')).toBe(true)
})

test('onShopsReady は、ホットペッパー・地図のお店・進み具合の3つがそろったとき1回だけ呼ばれる', async () => {
  let resolveHp!: (v: Shop[]) => void
  let resolveProgress!: (v: { cells: Cell[]; checkedShopIds: Set<string> }) => void
  const onShopsReady = vi.fn()
  tilesLoaded = false
  const { world } = setup({
    fetchHotpepper: vi.fn((_c: LatLng) => new Promise<Shop[]>((r) => { resolveHp = r })),
    loadProgress: vi.fn(() => new Promise<{ cells: Cell[]; checkedShopIds: Set<string> }>((r) => { resolveProgress = r })),
    onShopsReady,
  })
  world.onPosition(home)
  expect(world.shopsReady()).toBe(false)
  resolveHp([shop])
  await flush()
  expect(onShopsReady).not.toHaveBeenCalled() // 地図のお店がまだ
  tilesLoaded = true
  idleHandler!()
  expect(onShopsReady).not.toHaveBeenCalled() // 進み具合がまだ
  resolveProgress({ cells: [], checkedShopIds: new Set() })
  await flush()
  expect(onShopsReady).toHaveBeenCalledTimes(1)
  expect(world.shopsReady()).toBe(true)
  idleHandler!()
  world.onPosition(north(600))
  expect(onShopsReady).toHaveBeenCalledTimes(1)
})

test('shopsEnabled が false ならホットペッパーを待たずにそろう', async () => {
  const onShopsReady = vi.fn()
  const { world } = setup({ shopsEnabled: false, onShopsReady })
  world.onPosition(home)
  await flush()
  expect(onShopsReady).toHaveBeenCalledTimes(1)
})

test('setPinsVisible は1軒のピンとビル・施設のピンの両方に伝わる', () => {
  const { world } = setup()
  world.setPinsVisible(false)
  expect(pinsApi.setVisible).toHaveBeenLastCalledWith(false)
  expect(buildingApi.setHidden).toHaveBeenLastCalledWith(true)
})
