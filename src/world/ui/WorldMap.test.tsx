import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { TownProgress } from '../../towns/domain/progress.ts'

const els: HTMLElement[] = []
vi.mock('maplibre-gl', () => {
  class Map {
    private h: Record<string, (() => void)[]> = {}
    touchZoomRotate = { disableRotation() {} }
    constructor() { queueMicrotask(() => this.h.load?.forEach((f) => f())) }
    on(e: string, f: () => void) { (this.h[e] ??= []).push(f); return this }
    getStyle() { return { layers: [] } }
    setLayoutProperty() {}
    project([lng, lat]: number[]) { return { x: lng * 1000, y: lat * 1000 } }
    unproject([x, y]: number[]) { return { lng: x / 1000, lat: y / 1000 } }
    getZoom() { return 5 }
    easeTo() {}
    remove() {}
  }
  class Marker {
    constructor(o: { element: HTMLElement }) { this.el = o.element; els.push(o.element) }
    el: HTMLElement
    setLngLat() { return this }
    addTo() { return this }
    remove() { const i = els.indexOf(this.el); if (i >= 0) els.splice(i, 1) }
  }
  return { Map, Marker }
})
vi.mock('../../map/infra/maplibreWorker.ts', () => ({}))

import { WorldMap } from './WorldMap.tsx'

const town = (id: string, name: string, clearedAt: number | null): TownProgress =>
  ({ id, name, city: null, visited: 1, total: 5, clearedAt, completedAt: null, counting: false, lastAt: 0 })
const marker = (label: string) => els.find((e) => e.getAttribute('aria-label') === label)
const box = (lat: number, lng: number) => ({ minLat: lat, maxLat: lat + 0.01, minLng: lng, maxLng: lng + 0.01 })

beforeEach(() => { els.length = 0 })

test('町が 0 件でも落ちず、帯は 0 | 0', () => {
  render(<WorldMap towns={[]} onClose={() => {}} onOpen={() => {}} loadBoxes={async () => new Map()} />)
  expect(screen.getByText('行った町')).toBeInTheDocument()
  expect(screen.getAllByText('0')).toHaveLength(2)
})

test('2 町（1 つクリア）で行った町 2・クリア 1', () => {
  render(<WorldMap towns={[town('a', '札幌', 1), town('b', '仙台', null)]} onClose={() => {}} onOpen={() => {}} loadBoxes={async () => new Map()} />)
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('1')).toBeInTheDocument()
})

test('旗を押すと町の四角に寄せて onOpen、四角が無い町は旗が出ない', async () => {
  const onOpen = vi.fn()
  render(<WorldMap towns={[town('a', '札幌', 1), town('x', '謎', null)]} onClose={() => {}} onOpen={onOpen} loadBoxes={async () => new Map([['a', box(43, 141)]])} />)
  await waitFor(() => expect(marker('札幌')).toBeDefined())
  expect(marker('謎')).toBeUndefined()
  fireEvent.click(marker('札幌')!)
  const arg = onOpen.mock.calls[0][0]
  expect(arg.name).toBe('札幌')
  expect(arg.center.lat).toBeCloseTo(43.005)
  expect(arg.zoom).toBeGreaterThanOrEqual(13)
})

test('近い町は数の丸にまとまる', async () => {
  render(<WorldMap towns={[town('a', 'A', null), town('b', 'B', null)]} onClose={() => {}} onOpen={() => {}} loadBoxes={async () => new Map([['a', box(35, 139)], ['b', box(35, 139)]])} />)
  await waitFor(() => expect(marker('2つの町')).toBeDefined())
})

test('検索の候補を押すと zoom 15 で onOpen、←で onClose', async () => {
  const onOpen = vi.fn()
  const onClose = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{ geometry: { coordinates: [140.7, 41.7] }, properties: { title: '函館市' } }] })))
  render(<WorldMap towns={[]} onClose={onClose} onOpen={onOpen} loadBoxes={async () => new Map()} />)
  fireEvent.change(screen.getByLabelText('地名で探す'), { target: { value: '函館' } })
  fireEvent.click(await screen.findByText('函館市', undefined, { timeout: 2000 }))
  expect(onOpen).toHaveBeenCalledWith({ name: '函館市', center: { lat: 41.7, lng: 140.7 }, zoom: 15 })
  fireEvent.click(screen.getByLabelText('記録へ戻る'))
  expect(onClose).toHaveBeenCalled()
  vi.unstubAllGlobals()
})
