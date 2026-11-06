import { expect, test } from 'vitest'
import type { ShopKind } from './shop.ts'
import { kindFromHotpepper, kindFromMap } from './kind.ts'

const hp: [string | null, string, ShopKind][] = [
  ['G013', 'x', 'ramen'],
  ['G004', '鮨 さかな', 'sushi'],
  ['G004', '手打ち蕎麦', 'soba'],
  ['G004', 'うどん屋', 'soba'],
  [null, 'カレーの店', 'curry'],
  ['G008', 'x', 'yakiniku'],
  ['G017', 'x', 'yakiniku'],
  ['G007', 'x', 'chinese'],
  ['G005', 'x', 'western'],
  ['G006', 'x', 'western'],
  ['G004', '割烹', 'washoku'],
  ['G001', 'x', 'izakaya'],
  ['G002', 'x', 'izakaya'],
  ['G014', 'ケーキ工房', 'cake'],
  ['G014', 'スイーツ', 'cake'],
  ['G014', '珈琲館', 'cafe'],
  ['G014', 'x', 'cafe'],
  [null, 'ベーカリー', 'bakery'],
  [null, 'パン工房', 'bakery'],
  ['G010', 'x', 'mystery'],
]
test.each(hp)('kindFromHotpepper(%s, %s) = %s', (code, name, kind) => {
  expect(kindFromHotpepper(code, name)).toBe(kind)
})

const map: [string, string, ShopKind][] = [
  ['bakery', 'x', 'bakery'],
  ['confectionery', 'x', 'cake'],
  ['ice_cream', 'x', 'cake'],
  ['cafe', 'x', 'cafe'],
  ['bar', 'x', 'izakaya'],
  ['pub', 'x', 'izakaya'],
  ['restaurant', 'ラーメン太郎', 'ramen'],
  ['restaurant', '鮨 さかな', 'sushi'],
  ['fast_food', 'カレーハウス', 'curry'],
  ['restaurant', 'x', 'mystery'],
]
test.each(map)('kindFromMap(%s, %s) = %s', (sub, name, kind) => {
  expect(kindFromMap(sub, name)).toBe(kind)
})
