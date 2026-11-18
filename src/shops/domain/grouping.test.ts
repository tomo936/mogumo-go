import { expect, test } from 'vitest'
import { groupShops } from './grouping.ts'

const at = (id: string, x: number, y: number) => ({ id, footprintCenter: { x, y } })

test('中心が 0.5m 以内の2軒は1組', () => {
  expect(groupShops([at('a', 0, 0), at('b', 0.3, 0.3)])).toEqual([['a', 'b']])
})

test('中心が 2m 離れていれば別の組', () => {
  expect(groupShops([at('a', 0, 0), at('b', 2, 0)])).toEqual([['a'], ['b']])
})

test('輪郭の外（null）は同じ点でも1軒ずつ', () => {
  expect(groupShops([{ id: 'a', footprintCenter: null }, { id: 'b', footprintCenter: null }])).toEqual([['a'], ['b']])
})

test('6軒でも1組、並びは入力の順', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  expect(groupShops(ids.map((id) => at(id, 5, 5)))).toEqual([ids])
})

test('組の位置は最初に出た店の順', () => {
  expect(groupShops([at('a', 0, 0), at('c', 30, 0), at('b', 0.2, 0)])).toEqual([['a', 'b'], ['c']])
})
