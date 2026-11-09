import { expect, test } from 'vitest'
import { isDebug, rowText } from './debugOverlay.ts'

test('?debug があるときだけ有効', () => {
  expect(isDebug('?debug')).toBe(true)
  expect(isDebug('?fake&debug=1')).toBe(true)
  expect(isDebug('?fake')).toBe(false)
  expect(isDebug('')).toBe(false)
})

test('ピン横の文字に topM・持ち上げ・地面の差・大きさが入る', () => {
  const t = rowText({ at: { lat: 0, lng: 0 }, topM: 20.84, ground: { x: 1, y: 2 }, lift: { x: 1.23, y: -45.67 }, groundDiff: { x: 0, y: 0.5 }, scale: 0.8 })
  expect(t).toBe('top20.8m lift 1.2,-45.7 gd 0,0.5 s0.80')
  expect(rowText({ at: { lat: 0, lng: 0 }, topM: 5, ground: { x: 0, y: 0 }, lift: null, groundDiff: null, scale: 1 })).toContain('lift -')
})
