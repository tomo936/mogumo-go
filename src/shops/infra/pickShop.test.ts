import { expect, test } from 'vitest'
import { localFrame } from '../../map/domain/geo.ts'
import { pickShop } from './pickShop.ts'

// 1m = 2px の平らな投影（北が上、画面の原点は (139, 35)）
const f = localFrame({ lat: 35, lng: 139 })
const project = (p: { lat: number; lng: number }) => {
  const q = f.to(p)
  return { x: q.x * 2, y: -q.y * 2 }
}
const shop = (id: string, x: number, y: number, sizeM = 10) => ({
  id, kind: 'ramen' as const, ...f.back({ x: x / 2, y: -y / 2 }), facingDeg: 0, sizeM,
})

test('建物の中心付近を押すとその店', () => {
  expect(pickShop([shop('a', 100, 100)], { x: 100, y: 100 - 10 }, project)).toBe('a')
})

test('離れていれば null', () => {
  expect(pickShop([shop('a', 100, 100)], { x: 300, y: 300 }, project)).toBeNull()
})

test('重なったら中心がいちばん近い店', () => {
  const list = [shop('a', 100, 100), shop('b', 110, 100)]
  expect(pickShop(list, { x: 109, y: 90 }, project)).toBe('b')
})

test('小さい建物でも最低の押せる広さがある', () => {
  expect(pickShop([shop('a', 100, 100, 1)], { x: 100 + 15, y: 100 }, project)).toBe('a')
})
