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

// --- 最終レビューの指摘への対応 ---
import { FIRST_FIX_MAX_ACCURACY_M } from './config.ts'
import { isStale, shouldMoveCamera } from './smoothing.ts'

test('最初の測位は精度が粗くても（屋内の 65m など）地図を出すために使う', () => {
  expect(judgeFix(north(0, 0, 65), null)).toBe('snap')
})

test('最初の測位でも上限を超えて粗すぎるものは捨てる', () => {
  expect(judgeFix(north(0, 0, FIRST_FIX_MAX_ACCURACY_M + 1), null)).toBe('reject')
})

test('粗い測位のあとに精度のよい測位が来たら、誤差の分は飛びとみなさず受け入れる', () => {
  const rough = north(0, 0, 65)
  expect(judgeFix(north(65, 1000, 10), rough)).toBe('accept')
})

test('最後に受け入れてから SNAP_GAP_MS たつと途切れ扱い', () => {
  expect(isStale(1000, 1000 + SNAP_GAP_MS - 1)).toBe(false)
  expect(isStale(1000, 1000 + SNAP_GAP_MS)).toBe(true)
})

test('指で操作中はカメラを動かさない（ピンチを邪魔しない）', () => {
  expect(shouldMoveCamera(a, b, true)).toBe(false)
})

test('ほとんど動いていないコマはカメラを動かさない', () => {
  const tiny = { lat: a.lat + 0.001 / 111195, lng: a.lng }
  expect(shouldMoveCamera(a, tiny, false)).toBe(false)
  expect(shouldMoveCamera(a, b, false)).toBe(true)
  expect(shouldMoveCamera(null, b, false)).toBe(true)
})
