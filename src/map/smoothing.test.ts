import { expect, test } from 'vitest'
import { FOLLOW_TAU_MS, SNAP_GAP_MS } from './config.ts'
import { distanceMeters } from './geo.ts'
import { judgeFix, stepToward } from './smoothing.ts'
import type { Fix } from './smoothing.ts'

const base: Fix = { lat: 35.6812, lng: 139.7671, accuracy: 10, time: 0 }
// 北へ meters 進んだ測位（緯度1度 ≒ 111,195m）
const north = (meters: number, time: number, accuracy = 10): Fix => ({
  lat: base.lat + meters / 111195, lng: base.lng, accuracy, time,
})

test('最初の測位は一気に移す', () => {
  expect(judgeFix(base, null)).toBe('snap')
})

test('精度が 50m より悪い測位は捨てる', () => {
  expect(judgeFix(north(5, 1000, 51), base)).toBe('reject')
})

test('1秒で 10m 進むのは受け入れる', () => {
  expect(judgeFix(north(10, 1000), base)).toBe('accept')
})

test('1秒で 100m 飛ぶのは捨てる', () => {
  expect(judgeFix(north(100, 1000), base)).toBe('reject')
})

test('長く途切れたあとは遠くても一気に移す', () => {
  expect(judgeFix(north(2000, SNAP_GAP_MS), base)).toBe('snap')
})

const a = { lat: base.lat, lng: base.lng }
const b = { lat: base.lat + 100 / 111195, lng: base.lng }

test('経過 0 なら動かない', () => {
  expect(stepToward(a, b, 0)).toEqual(a)
})

test('FOLLOW_TAU_MS で距離が約 63% 縮む', () => {
  const p = stepToward(a, b, FOLLOW_TAU_MS)
  const ratio = 1 - distanceMeters(p, b) / distanceMeters(a, b)
  expect(Math.abs(ratio - (1 - Math.exp(-1)))).toBeLessThan(0.02)
})

test('裏から戻って経過が巨大でも行き過ぎず目標に一致', () => {
  const p = stepToward(a, b, 600000)
  expect(distanceMeters(p, b)).toBeLessThan(0.001)
})
