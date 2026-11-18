import { expect, test } from 'vitest'
import { bearingDeg, facingFor, isWalking, smoothSpeed } from './avatar.ts'

const o = { lat: 35, lng: 139 }

test('方位: 北が0、東が90、南が180、西が270', () => {
  expect(bearingDeg(o, { lat: 35.001, lng: 139 })).toBeCloseTo(0)
  expect(bearingDeg(o, { lat: 35, lng: 139.001 })).toBeCloseTo(90)
  expect(bearingDeg(o, { lat: 34.999, lng: 139 })).toBeCloseTo(180)
  expect(bearingDeg(o, { lat: 35, lng: 138.999 })).toBeCloseTo(270)
})

test('地図が北向きなら、北へ進むと画面の上（back）、東は right', () => {
  expect(facingFor(0, 0)).toBe('back')
  expect(facingFor(90, 0)).toBe('right')
  expect(facingFor(180, 0)).toBe('front')
  expect(facingFor(270, 0)).toBe('left')
  expect(facingFor(45, 0)).toBe('back-right')
  expect(facingFor(225, 0)).toBe('front-left')
})

test('地図の回転を引く: 東向きの地図（bearing 90）で東へ進むと上', () => {
  expect(facingFor(90, 90)).toBe('back')
  expect(facingFor(0, 90)).toBe('left')
})

test('360度をまたいでも正しく選ぶ', () => {
  expect(facingFor(30, 350)).toBe('back-right')
  expect(facingFor(330, 10)).toBe('back-left')
  expect(facingFor(359, 0)).toBe('back')
})

test('速さは動くほど上がり、止まると下がる', () => {
  let v = 0
  for (let i = 0; i < 30; i++) v = smoothSpeed(v, 1.4 / 60, 1000 / 60) // 1.4m/秒
  expect(v).toBeGreaterThan(1)
  expect(isWalking(v)).toBe(true)
  for (let i = 0; i < 60; i++) v = smoothSpeed(v, 0, 1000 / 60)
  expect(isWalking(v)).toBe(false)
})

test('時間が進まないときは速さを変えない', () => {
  expect(smoothSpeed(1, 5, 0)).toBe(1)
})
