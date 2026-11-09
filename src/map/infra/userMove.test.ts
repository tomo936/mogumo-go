import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { watchUserMove } from './userMove.ts'

let handlers: Map<string, (e?: { originalEvent?: unknown }) => void>
let moving: boolean
let container: HTMLElement
let map: MapLibreMap
const changes: boolean[] = []

const down = (id: number) => container.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerId: id }))
const up = (id: number, type = 'pointerup') => window.dispatchEvent(Object.assign(new Event(type), { pointerId: id }))

beforeEach(() => {
  handlers = new Map()
  moving = false
  changes.length = 0
  container = document.createElement('div')
  map = {
    getContainer: () => container,
    isMoving: () => moving,
    on: vi.fn((e: string, h: () => void) => handlers.set(e, h)),
    off: vi.fn((e: string) => handlers.delete(e)),
  } as unknown as MapLibreMap
})

test('1本指でなぞって回す（setBearing なので originalEvent なし）間は動いている扱い。指を離して止まっていれば戻る', () => {
  watchUserMove(map, (m) => changes.push(m))
  down(1)
  expect(changes).toEqual([]) // 触っただけ（タップ）では隠さない
  handlers.get('move')!({})
  handlers.get('moveend')!({}) // setBearing は1回ごとに moveend まで出す。指が触れている間は戻さない
  handlers.get('move')!({})
  expect(changes).toEqual([true])
  up(1)
  expect(changes).toEqual([true, false])
})

test('ピンチ（originalEvent あり）は、指を離しても惰性で動いている間は隠したまま、moveend で戻る', () => {
  watchUserMove(map, (m) => changes.push(m))
  down(1)
  down(2)
  handlers.get('move')!({ originalEvent: {} })
  moving = true
  up(1)
  up(2, 'pointercancel')
  expect(changes).toEqual([true])
  moving = false
  handlers.get('moveend')!({})
  expect(changes).toEqual([true, false])
})

test('PC のホイール（指なし・originalEvent あり）でも隠し、moveend で戻る', () => {
  watchUserMove(map, (m) => changes.push(m))
  handlers.get('move')!({ originalEvent: {} })
  handlers.get('moveend')!({})
  expect(changes).toEqual([true, false])
})

test('歩いてカメラが自動でついてくる動き（指なし・originalEvent なし）では隠さない', () => {
  watchUserMove(map, (m) => changes.push(m))
  handlers.get('move')!({})
  handlers.get('moveend')!({})
  expect(changes).toEqual([])
})

test('止めると、地図と指のイベントを外す', () => {
  const stop = watchUserMove(map, (m) => changes.push(m))
  stop()
  expect(handlers.size).toBe(0)
  down(1)
  up(1)
  expect(changes).toEqual([])
})
