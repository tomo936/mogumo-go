import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { distanceMeters } from '../domain/geo.ts'
import { isFakeWalkEnabled, startFakeWalk } from './fakeWalk.ts'
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
