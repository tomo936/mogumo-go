import { expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { createCheckMarks } from './checkMarks.ts'
import type { PlacedShop } from './shopLayer.ts'

const made: { opts: { offset: number[] }; at: number[]; removed: boolean }[] = []
vi.mock('maplibre-gl', () => ({
  Marker: class {
    rec = { opts: {} as { offset: number[] }, at: [] as number[], removed: false }
    constructor(opts: { offset: number[] }) { this.rec.opts = opts; made.push(this.rec) }
    setLngLat(at: number[]) { this.rec.at = at; return this }
    addTo() { return this }
    remove() { this.rec.removed = true }
  },
}))

const shop = (id: string, lng: number, sizeM = 10): PlacedShop => ({ id, kind: 'ramen', lat: 35, lng, facingDeg: 0, sizeM })
const map = {} as MapLibreMap

test('済みの店だけに印を付け、動かし、外し、dispose で全部消す', () => {
  made.length = 0
  const marks = createCheckMarks(map)
  marks.update([shop('a', 139), shop('b', 139.1)], new Set(['a']))
  expect(made).toHaveLength(1)
  expect(made[0].at).toEqual([139, 35])
  expect(made[0].opts.offset).toEqual([0, -14])
  marks.update([shop('a', 139.5), shop('b', 139.1)], new Set(['a']))
  expect(made).toHaveLength(1)
  expect(made[0].at).toEqual([139.5, 35])
  marks.update([shop('b', 139.1)], new Set(['a']))
  expect(made[0].removed).toBe(true)
  marks.update([shop('b', 139.1)], new Set(['a', 'b']))
  expect(made).toHaveLength(2)
  marks.dispose()
  expect(made[1].removed).toBe(true)
})
