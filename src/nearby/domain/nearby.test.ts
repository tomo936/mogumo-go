import { expect, test } from 'vitest'
import { cellKey, cellsInCircle } from '../../fog/domain/grid.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { WALK_RADIUS_M, kindsIn, nearbyShops } from './nearby.ts'

const me = { lat: 35.65, lng: 139.63 }
// 緯度 0.001 度 ≒ 111m
const at = (id: string, dLat: number, kind: Shop['kind'] = 'ramen'): Shop =>
  ({ id, name: id, lat: me.lat + dLat, lng: me.lng, kind, details: null, mapId: null })
// 自分のまわり 2km を全部晴れにする
const allCleared = () => new Set(cellsInCircle(me, 2000).map(cellKey))

test('徒歩圏内（WALK_RADIUS_M 以内）だけを近い順に返す', () => {
  const list = nearbyShops([at('far', 0.01), at('mid', 0.004), at('near', 0.001)], me, allCleared(), null)
  expect(list.map((x) => x.shop.id)).toEqual(['near', 'mid'])
  expect(list[0].distanceM).toBeGreaterThan(100)
  expect(list.every((x) => x.distanceM <= WALK_RADIUS_M)).toBe(true)
})

test('霧の中の店は出さない（S1）。ただし 50m 以内なら出す', () => {
  const list = nearbyShops([at('fog', 0.003), at('close', 0.0003)], me, new Set(), null)
  expect(list.map((x) => x.shop.id)).toEqual(['close'])
})

test('ジャンルで絞り込む。null は全部', () => {
  const shops = [at('a', 0.001, 'ramen'), at('b', 0.002, 'cafe'), at('c', 0.003, 'ramen')]
  expect(nearbyShops(shops, me, allCleared(), 'ramen').map((x) => x.shop.id)).toEqual(['a', 'c'])
  expect(nearbyShops(shops, me, allCleared(), null)).toHaveLength(3)
})

test('隠す店（正体が伏せられた気配の店）は出さない', () => {
  const list = nearbyShops([at('a', 0.001), at('hidden', 0.002)], me, allCleared(), null, new Set(['hidden']))
  expect(list.map((x) => x.shop.id)).toEqual(['a'])
})

test('kindsIn: 絞り込みの前の店から、ジャンルごとの数を多い順に（同数は一覧の順）', () => {
  const shops = [at('a', 0.001, 'cafe'), at('b', 0.002, 'ramen'), at('c', 0.003, 'ramen'), at('d', 0.004, 'sushi')]
  expect(kindsIn(nearbyShops(shops, me, allCleared(), null))).toEqual([['ramen', 2], ['cafe', 1], ['sushi', 1]])
})
