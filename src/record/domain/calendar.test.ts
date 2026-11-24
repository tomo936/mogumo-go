import { expect, test } from 'vitest'
import { addMonths, countByDay, monthGrid } from './calendar.ts'

test('2026 年 11 月は日曜はじまり・1 日が日曜で、5 週', () => {
  const g = monthGrid('2026-11')
  expect(g[0]).toEqual({ day: '2026-11-01', date: 1, inMonth: true })
  expect(g.length).toBe(35)
  expect(g.filter((d) => d.inMonth).length).toBe(30)
  expect(g[30]).toEqual({ day: '2026-12-01', date: 1, inMonth: false })
})

test('前の月の日で頭を埋める（2026 年 12 月は火曜はじまり）', () => {
  const g = monthGrid('2026-12')
  expect(g.slice(0, 2).map((d) => d.day)).toEqual(['2026-11-29', '2026-11-30'])
  expect(g[2].day).toBe('2026-12-01')
  expect(g.length % 7).toBe(0)
})

test('月をまたぐ・年をまたぐ', () => {
  expect(addMonths('2026-12', 1)).toBe('2027-01')
  expect(addMonths('2026-01', -1)).toBe('2025-12')
})

test('日ごとの回数', () => {
  expect(countByDay([{ day: 'a' }, { day: 'a' }, { day: 'b' }]).get('a')).toBe(2)
})
