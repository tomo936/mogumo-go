import { beforeEach, expect, test, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { watchUserMove } from './userMove.ts'

let handlers: Map<string, (e?: { originalEvent?: unknown }) => void>
let moving: boolean
let container: HTMLElement
let map: MapLibreMap
const changes: boolean[] = []

const down = (id: number, x = 0) => container.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerId: id, clientX: x, clientY: 0 }))
const drag = (id: number, x: number) => window.dispatchEvent(Object.assign(new Event('pointermove'), { pointerId: id, clientX: x, clientY: 0 }))
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
  drag(1, 40)
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

test('歩いてカメラがついてくる間に指を置いた（タップ）だけでは隠さない（隠すとピンが押せない。2026-11-16 オーナー「移動中ピンタップ出来なくなる」）', () => {
  watchUserMove(map, (m) => changes.push(m))
  down(1, 100)
  handlers.get('move')!({}) // 追いかけの jumpTo
  drag(1, 104) // 指の小さなぶれ
  handlers.get('move')!({ originalEvent: {} }) // 見て回るモードの dragPan が少しだけ動かす
  up(1)
  expect(changes).toEqual([])
})

test('惰性で滑っている地図を指で止めたら、すぐピンを戻す（そのまま押せる）', () => {
  watchUserMove(map, (m) => changes.push(m))
  down(1, 0)
  drag(1, 60)
  handlers.get('move')!({ originalEvent: {} })
  moving = true // 指を離しても惰性で滑る
  up(1)
  expect(changes).toEqual([true])
  down(1, 60) // 指を置くと惰性が止まる
  moving = false
  handlers.get('moveend')!({})
  expect(changes).toEqual([true, false])
})

test('止めると、地図と指のイベントを外す', () => {
  const stop = watchUserMove(map, (m) => changes.push(m))
  stop()
  expect(handlers.size).toBe(0)
  down(1)
  up(1)
  expect(changes).toEqual([])
})
