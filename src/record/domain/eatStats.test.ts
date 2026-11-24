import { expect, test } from 'vitest'
import { eatStats } from './eatStats.ts'

const v = (shopId: string, kind: 'ramen' | 'cafe' | 'mystery', day: string) => ({ shopId, kind, day })

test('お店・回数・種類・いちばんの種類・直近 6 か月', () => {
  const s = eatStats([v('a', 'ramen', '2026-11-03'), v('a', 'ramen', '2026-11-10'), v('b', 'ramen', '2026-10-01'), v('c', 'cafe', '2026-06-30'), v('d', 'mystery', '2026-11-20')], '2026-11-24')
  expect(s.shops).toBe(4)
  expect(s.visits).toBe(5)
  expect(s.kinds).toBe(2) // なぞは数えない
  expect(s.topKind).toEqual({ kind: 'ramen', shops: 2 })
  expect(s.months.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
  expect(s.months.map((m) => m.visits)).toEqual([1, 0, 0, 0, 1, 3])
})

test('年をまたぐ月と、記録が無いとき', () => {
  expect(eatStats([], '2027-02-01').months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'])
  expect(eatStats([], '2027-02-01').topKind).toBeNull()
})
