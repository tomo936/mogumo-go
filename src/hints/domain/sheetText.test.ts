import { expect, test } from 'vitest'
import { directionName, kindFromGenre, untilResetLabel } from './sheetText.ts'

const me = { lat: 35.65, lng: 139.63 }

test('directionName: 8方位、すぐ近くは null', () => {
  expect(directionName(me, { lat: 35.654, lng: 139.63 })).toBe('北')
  expect(directionName(me, { lat: 35.653, lng: 139.6337 })).toBe('北東')
  expect(directionName(me, { lat: 35.645, lng: 139.63 })).toBe('南')
  expect(directionName(me, { lat: 35.65, lng: 139.625 })).toBe('西')
  expect(directionName(me, { lat: 35.65005, lng: 139.63 })).toBeNull()
})

test('untilResetLabel: 日本時間の0時まで', () => {
  expect(untilResetLabel(new Date('2026-11-10T17:00:00+09:00'))).toBe('7時間')
  expect(untilResetLabel(new Date('2026-11-10T23:30:00+09:00'))).toBe('まもなく')
})

test('kindFromGenre: ジャンル名から料理の種類、無ければ mystery', () => {
  expect(kindFromGenre('ラーメン')).toBe('ramen')
  expect(kindFromGenre('中華')).toBe('chinese')
  expect(kindFromGenre(null)).toBe('mystery')
})
