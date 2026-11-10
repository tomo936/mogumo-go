import { expect, test } from 'vitest'
import { CATALOG } from './catalog.ts'
import { tierOf } from './types.ts'

test('id が重複しない', () => {
  expect(new Set(CATALOG.map((d) => d.id)).size).toBe(CATALOG.length)
})

test('ジャンルは 18種類 × 5段 = 90 個、★1〜5 と回数 1・3・10・30・50', () => {
  const genre = CATALOG.filter((d) => d.group === 'genre')
  expect(genre).toHaveLength(90)
  const ramen = genre.filter((d) => d.id.startsWith('genre_ramen_'))
  expect(ramen.map((d) => [d.stars, d.need, d.name])).toEqual([
    [1, 1, 'はじめてのラーメン'], [2, 3, 'ラーメン好き'], [3, 10, 'ラーメン通'], [4, 30, 'ラーメン名人'], [5, 50, 'ラーメンマスター'],
  ])
})

test('★とメダルの色がそろう', () => {
  expect([1, 2, 3, 4, 5].map((s) => tierOf(s as 1))).toEqual(['cream', 'bronze', 'silver', 'gold', 'rainbow'])
})

test('名前と条件が空でなく、季節・ちょっと変わったはひみつ', () => {
  for (const d of CATALOG) {
    expect(d.name.trim()).not.toBe('')
    expect(d.how.trim()).not.toBe('')
    if (d.group === 'season' || d.group === 'quirky') expect(d.secret).toBe(true)
  }
})
