import { expect, test } from 'vitest'
import { nudgeMilestone } from './linkNudge.ts'

test('1・5・10 軒、そのあと 10 軒ごと。前に勧めた節目より大きいときだけ', () => {
  expect(nudgeMilestone(0, 0)).toBeNull()
  expect(nudgeMilestone(1, 0)).toBe(1)
  expect(nudgeMilestone(2, 1)).toBeNull()
  expect(nudgeMilestone(5, 1)).toBe(5)
  expect(nudgeMilestone(9, 5)).toBeNull()
  expect(nudgeMilestone(10, 5)).toBe(10)
  expect(nudgeMilestone(19, 10)).toBeNull()
  expect(nudgeMilestone(20, 10)).toBe(20)
  expect(nudgeMilestone(37, 20)).toBe(30)
})

test('いくつも飛ばしたら、いちばん新しい節目を 1 回だけ', () => {
  expect(nudgeMilestone(12, 0)).toBe(10)
  expect(nudgeMilestone(12, 10)).toBeNull()
})
