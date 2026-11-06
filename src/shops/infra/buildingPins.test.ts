import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { createBuildingPins } from './buildingPins.ts'
import type { PlacedShop } from './shopLayer.ts'
import type { Shop } from '../domain/shop.ts'

const made: { el: HTMLElement; removed: boolean }[] = []
vi.mock('maplibre-gl', () => ({
  Marker: class {
    rec: { el: HTMLElement; removed: boolean }
    constructor(opts: { element: HTMLElement }) { this.rec = { el: opts.element, removed: false }; made.push(this.rec) }
    setLngLat() { return this }
    addTo() { return this }
    remove() { this.rec.removed = true }
  },
}))

let zoom = 17
let zoomEnd: (() => void) | null = null
const map = { getZoom: () => zoom, on: vi.fn((_e: string, h: () => void) => { zoomEnd = h }), off: vi.fn() } as unknown as MapLibreMap
const shop = (id: string): Shop => ({ id, name: id, lat: 35, lng: 139, kind: 'cafe', details: null, mapId: null })
const bldg = (ids: string[]) => ({
  placed: { id: `bldg:${ids[0]}`, model: 'building', shopIds: ids, lat: 35, lng: 139, facingDeg: 0, sizeM: 16 } as PlacedShop,
  shops: ids.map(shop),
})
const live = () => made.filter((m) => !m.removed)

beforeEach(() => {
  made.length = 0
  zoom = 17
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
