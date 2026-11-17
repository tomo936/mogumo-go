import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { distanceMeters } from '../domain/geo.ts'
import { fakeStart, isFakeWalkEnabled, startFakeWalk } from './fakeWalk.ts'
import type { Fix } from '../domain/smoothing.ts'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('1秒ごとに約 1.4m ずつ歩き、止めたら呼ばれない', () => {
  const fixes: Fix[] = []
  const stop = startFakeWalk((f) => fixes.push(f))
  vi.advanceTimersByTime(3000)
  expect(fixes).toHaveLength(3)
  for (let i = 1; i < fixes.length; i++) {
    expect(Math.abs(distanceMeters(fixes[i - 1], fixes[i]) - 1.4)).toBeLessThan(0.2)
  }
  stop()
  vi.advanceTimersByTime(3000)
  expect(fixes).toHaveLength(3)
})

test('開発中で fake が付いているときだけ有効', () => {
  expect(isFakeWalkEnabled('?fake', true)).toBe(true)
  expect(isFakeWalkEnabled('?fake', false)).toBe(false)
  expect(isFakeWalkEnabled('', true)).toBe(false)
})

test('自宅から始めると、最初の点は自宅から 2m 以内', () => {
  const home = { lat: 35.68, lng: 139.76 }
  const fixes: Fix[] = []
  const stop = startFakeWalk((f) => fixes.push(f), home)
  vi.advanceTimersByTime(1000)
  stop()
  expect(distanceMeters(home, fixes[0])).toBeLessThan(2)
})

test('dev のサイト（mogumo-go-dev.vercel.app）でも ?fake で歩いたふり。本番のサイトでは使えない（2026-11-17 ミシェーラの結合試験のため）', () => {
  expect(isFakeWalkEnabled('?fake', false, 'mogumo-go-dev.vercel.app')).toBe(true)
  expect(isFakeWalkEnabled('?fake', false, 'mogumo-go.vercel.app')).toBe(false)
  expect(isFakeWalkEnabled('', false, 'mogumo-go-dev.vercel.app')).toBe(false)
})

test('fakeStart: ?fake=緯度,経度 で始める場所。書いていない・読めないときは null', () => {
  expect(fakeStart('?fake=35.6512,139.6362')).toEqual({ lat: 35.6512, lng: 139.6362 })
  expect(fakeStart('?fake')).toBeNull()
  expect(fakeStart('?fake=abc')).toBeNull()
  expect(fakeStart('?fake=95,139')).toBeNull()
})
