import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { DailyHint } from '../domain/hint.ts'
import { createHintPins } from './hintPins.ts'

const made: { el: HTMLElement; removed: boolean; lngLat: number[] }[] = []
vi.mock('maplibre-gl', () => ({
  Marker: class {
    rec: { el: HTMLElement; removed: boolean; lngLat: number[] }
    constructor(opts: { element: HTMLElement }) { this.rec = { el: opts.element, removed: false, lngLat: [] }; made.push(this.rec) }
    setLngLat(l: number[]) { this.rec.lngLat = l; return this }
    addTo() { return this }
    remove() { this.rec.removed = true }
  },
}))

const map = {} as unknown as MapLibreMap
const hint = (id: string, o: Partial<DailyHint> = {}): DailyHint => ({
  id, slot: 1, shopId: `hp:${id}`, genre: null, catch: null, budget: null, isMystery: false, completed: false,
  shop: { name: id, lat: 35, lng: 139 }, ...o,
})
const pos = (...ids: string[]) => new Map(ids.map((id, i) => [id, { lat: 35 + i * 0.001, lng: 139 }]))
const live = () => made.filter((m) => !m.removed)

beforeEach(() => { made.length = 0 })

test('3件で3つのマーカーを作る', () => {
  const pins = createHintPins(map, vi.fn())
  pins.update([hint('a'), hint('b'), hint('c')], pos('a', 'b', 'c'), new Set())
  expect(live()).toHaveLength(3)
  expect(live()[1].lngLat).toEqual([139, 35.001])
})

test('達成済みは作らない', () => {
  const pins = createHintPins(map, vi.fn())
  pins.update([hint('a'), hint('b', { completed: true })], pos('a', 'b'), new Set())
  expect(live()).toHaveLength(1)
})

test('同じ内容で update しても作り直さない', () => {
  const pins = createHintPins(map, vi.fn())
  pins.update([hint('a')], pos('a'), new Set())
  pins.update([hint('a')], pos('a'), new Set())
  expect(made).toHaveLength(1)
})

test('別の組で update すると古いマーカーを全部消し、新しいものだけになる', () => {
  const pins = createHintPins(map, vi.fn())
  pins.update([hint('a'), hint('b')], pos('a', 'b'), new Set())
  pins.update([hint('c')], pos('c'), new Set())
  expect(made.filter((m) => m.removed)).toHaveLength(2)
  expect(live()).toHaveLength(1)
})

test('明かし済みは別のクラス、謎の気配も別のクラス', () => {
  const pins = createHintPins(map, vi.fn())
  pins.update([hint('a'), hint('b', { isMystery: true })], pos('a', 'b'), new Set(['a']))
  expect(live()[0].el.classList.contains('hint-pin--revealed')).toBe(true)
  expect(live()[1].el.classList.contains('hint-pin--mystery')).toBe(true)
})

test('押すと onTap(id)。pointerdown は外に伝わらない', () => {
  const onTap = vi.fn()
  const pins = createHintPins(map, onTap)
  pins.update([hint('a')], pos('a'), new Set())
  live()[0].el.click()
  expect(onTap).toHaveBeenCalledWith('a')
  const outer = vi.fn()
  document.body.addEventListener('pointerdown', outer)
  document.body.appendChild(live()[0].el)
  live()[0].el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(outer).not.toHaveBeenCalled()
  document.body.removeEventListener('pointerdown', outer)
})

test('bounce でクラスが付き、約0.4秒で外れる', () => {
  vi.useFakeTimers()
  const pins = createHintPins(map, vi.fn())
  pins.update([hint('a')], pos('a'), new Set())
  pins.bounce('a')
  expect(live()[0].el.classList.contains('hint-pin--bounce')).toBe(true)
  vi.advanceTimersByTime(450)
  expect(live()[0].el.classList.contains('hint-pin--bounce')).toBe(false)
  vi.useRealTimers()
})

test('dispose で全部消える', () => {
  const pins = createHintPins(map, vi.fn())
  pins.update([hint('a'), hint('b')], pos('a', 'b'), new Set())
  pins.dispose()
  expect(live()).toHaveLength(0)
})
