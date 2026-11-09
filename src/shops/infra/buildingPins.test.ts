import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { createBuildingPins } from './buildingPins.ts'
import type { PlacedShop } from './shopLayer.ts'
import type { Shop } from '../domain/shop.ts'

const made: { el: HTMLElement; removed: boolean }[] = []
const offsets: number[][] = []
vi.mock('maplibre-gl', () => ({
  Marker: class {
    rec: { el: HTMLElement; removed: boolean }
    constructor(opts: { element: HTMLElement }) { this.rec = { el: opts.element, removed: false }; made.push(this.rec) }
    setLngLat() { return this }
    setOffset(o: number[]) { offsets.push(o); return this }
    addTo() { return this }
    remove() { this.rec.removed = true }
  },
}))

let zoom = 17
let zoomEnd: (() => void) | null = null
let ppm = 4 // 1m あたりの px
let moved: (() => void) | null = null
const handlers = new Map<string, (e?: { originalEvent?: unknown }) => void>()
const container = document.createElement('div')
const map = {
  getContainer: () => container,
  getZoom: () => zoom,
  project: (p: [number, number]) => ({ x: (p[0] - 139) * 91188 * ppm, y: -(p[1] - 35) * 111320 * ppm * 0.5 }),
  on: vi.fn((e: string, h: () => void) => { if (e === 'zoomend') zoomEnd = h; else if (e === 'render') moved = h; else handlers.set(e, h) }),
  off: vi.fn(),
} as unknown as MapLibreMap
const shop = (id: string): Shop => ({ id, name: id, lat: 35, lng: 139, kind: 'cafe', details: null, mapId: null })
const bldg = (ids: string[], facility = false, spots: { id: string; x: number; y: number; topM?: number }[] = []) => ({
  facility,
  label: null as { text: string; station: boolean } | null,
  topM: 16 * 1.3,
  spots: spots.map((s) => ({ topM: 16 * 1.3, ...s })),
  placed: { id: `bldg:${ids[0]}`, model: 'building', shopIds: ids, lat: 35, lng: 139, facingDeg: 0, sizeM: 16 } as PlacedShop,
  shops: ids.map(shop),
})
const live = () => made.filter((m) => !m.removed)

beforeEach(() => {
  made.length = 0
  offsets.length = 0
  zoom = 17
  ppm = 4
})

test('ピンを押すと onTap([その店の id])、まとめたピンは onTap(全員の id)', () => {
  const onTap = vi.fn()
  const pins = createBuildingPins(map, onTap)
  pins.update([bldg(['a', 'b'])], new Set())
  live()[0].el.querySelectorAll<HTMLElement>('.bldg-pin')[1].click()
  expect(onTap).toHaveBeenLastCalledWith(['b'])
  zoom = 15
  zoomEnd!()
  live()[0].el.querySelector<HTMLElement>('.bldg-pin')!.click()
  expect(onTap).toHaveBeenLastCalledWith(['a', 'b'])
})

test('pointerdown は外に伝わらない', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.update([bldg(['a', 'b'])], new Set())
  const outer = vi.fn()
  const wrap = document.createElement('div')
  wrap.addEventListener('pointerdown', outer)
  wrap.appendChild(live()[0].el)
  live()[0].el.querySelector('.bldg-pin')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(outer).not.toHaveBeenCalled()
})

test('update を2回呼んでもマーカーは組の数だけ', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.update([bldg(['a', 'b']), bldg(['c', 'd'])], new Set())
  pins.update([bldg(['a', 'b']), bldg(['c', 'd'])], new Set())
  expect(live()).toHaveLength(2)
})

test('済みの店のピンに ✓、まとめたピンに「1/3」', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.update([bldg(['a', 'b', 'c'])], new Set(['b']))
  const ps = live()[0].el.querySelectorAll('.bldg-pin')
  expect(ps).toHaveLength(3)
  expect(ps[1].textContent).toContain('✓')
  expect(ps[0].textContent).not.toContain('✓')
  zoom = 15
  zoomEnd!()
  expect(live()).toHaveLength(1)
  expect(live()[0].el.textContent).toContain('1/3')
})

test('ズームが変わってもまとめ方が同じなら作り直さない', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.update([bldg(['a', 'b'])], new Set())
  zoom = 18
  zoomEnd!()
  expect(made).toHaveLength(1)
})

test('6軒以上の小さいビルは5つ＋「+N」、+N を押すと全員の id', () => {
  const onTap = vi.fn()
  const pins = createBuildingPins(map, onTap)
  pins.update([bldg(['a', 'b', 'c', 'd', 'e', 'f', 'g'])], new Set())
  const el = live()[0].el
  expect(el.querySelectorAll('.bldg-pin')).toHaveLength(5)
  const more = el.querySelector<HTMLElement>('.bldg-pin__more')!
  expect(more.textContent).toBe('+2')
  more.click()
  expect(onTap).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
})

test('大型の施設は2軒でもまとめたピン', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.update([bldg(['a', 'b'], true)], new Set(['a']))
  expect(live()[0].el.textContent).toContain('1/2')
  expect(live()[0].el.querySelectorAll('.bldg-pin')).toHaveLength(1)
})

test('ピンはビルの幅に合わせて縮み、ビルの屋根の上（大きさ×1.3、傾きの分だけ縮む）に出る。カメラが動けば合わせ直す', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.update([bldg(['a', 'b', 'c'])], new Set())
  const inner = () => live()[0].el.querySelector<HTMLElement>('.bldg-pins__scale')!
  expect(inner().style.transform).toMatch(/scale\(0\.91\d*\)/) // 16m*4px*1.4/98 ≈ 0.914
  expect(offsets.at(-1)![1]).toBeCloseTo(-16 * 1.3 * 4 * Math.sin(Math.PI / 3), 0)
  ppm = 2
  moved!()
  expect(offsets.at(-1)![1]).toBeCloseTo(-16 * 1.3 * 2 * Math.sin(Math.PI / 3), 0)
  expect(inner().style.transform).toMatch(/scale\(0\.55\)/)
})

test('施設・ズーム18は塊ごとのマーカー（近い2軒は1つのマーカーに2本）、ズーム17に戻すと1つにまとまる', () => {
  const pins = createBuildingPins(map, vi.fn())
  zoom = 18
  const spots = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 30, y: 0 }]
  pins.update([bldg(['a', 'b', 'c'], true, spots)], new Set())
  expect(live()).toHaveLength(2)
  expect(live()[0].el.querySelectorAll('.bldg-pin')).toHaveLength(2)
  zoom = 17
  zoomEnd!()
  expect(live()).toHaveLength(1)
  expect(live()[0].el.textContent).toContain('0/3')
})

test('同じ所に4軒以上なら「+4」の札、押すとその4軒の id', () => {
  const onTap = vi.fn()
  const pins = createBuildingPins(map, onTap)
  zoom = 18
  const spots = ['a', 'b', 'c', 'd'].map((id) => ({ id, x: 0, y: 0 }))
  pins.update([bldg(['a', 'b', 'c', 'd'], true, spots)], new Set())
  const more = live()[0].el.querySelector<HTMLElement>('.bldg-pin__more')!
  expect(more.textContent).toBe('+4')
  more.click()
  expect(onTap).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd'])
})

test('ピンの高さは topM を使う', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.update([{ ...bldg(['a', 'b']), topM: 30 }], new Set())
  expect(offsets.at(-1)![1]).toBeCloseTo(-30 * 4 * Math.sin(Math.PI / 3), 0)
})

test('散らばったピンは、塊の店の屋根のうち一番高い所に出る', () => {
  const pins = createBuildingPins(map, vi.fn())
  zoom = 18
  const spots = [{ id: 'a', x: 0, y: 0, topM: 5 }, { id: 'b', x: 1, y: 0, topM: 12 }, { id: 'c', x: 30, y: 0, topM: 5 }]
  pins.update([{ ...bldg(['a', 'b', 'c'], true, spots), topM: 30 }], new Set())
  const up = 4 * Math.sin(Math.PI / 3)
  expect(offsets.at(-2)![1]).toBeCloseTo(-12 * up, 0) // a と b の塊は高い方の b
  expect(offsets.at(-1)![1]).toBeCloseTo(-5 * up, 0)
})

test('カメラが動いても大きさと高さが同じなら書き直さない', () => {
  const pins = createBuildingPins(map, vi.fn())
  zoom = 18
  const spots = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 30, y: 0 }]
  pins.update([bldg(['a', 'b'], true, spots)], new Set())
  const n = offsets.length
  moved!()
  expect(offsets.length).toBe(n)
})

test('名前の札を出す（駅は駅名標の形）。縮小でも拡大でも1つだけ', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.update([{ ...bldg(['a', 'b'], true, [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 30, y: 0 }]), label: { text: '経堂駅', station: true } }], new Set())
  const names = () => made.filter((m) => !m.removed).flatMap((m) => [...m.el.querySelectorAll('.bldg-name')])
  expect(names().map((n) => n.textContent)).toEqual(['経堂駅'])
  expect(names()[0].classList.contains('bldg-name--station')).toBe(true)
  zoom = 18
  zoomEnd!()
  expect(names()).toHaveLength(1)
})

test('setMoving(true) の間だけ隠す（人が地図を動かしている間。判定は map/infra/userMove.ts）、dispose で class を外す', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.setMoving(true)
  expect(container.classList.contains('pins-moving')).toBe(true)
  pins.setMoving(false)
  expect(container.classList.contains('pins-moving')).toBe(false)
  pins.setMoving(true)
  pins.dispose()
  expect(container.classList.contains('pins-moving')).toBe(false)
})

test('setHidden で出す・出さないを切りかえ、dispose で class を外す', () => {
  const pins = createBuildingPins(map, vi.fn())
  pins.setHidden(true)
  expect(container.classList.contains('pins-off')).toBe(true)
  pins.setHidden(false)
  expect(container.classList.contains('pins-off')).toBe(false)
  pins.setHidden(true)
  pins.dispose()
  expect(container.classList.contains('pins-off')).toBe(false)
})
