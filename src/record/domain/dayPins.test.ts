import { expect, test } from 'vitest'
import type { VisitEntry } from './timeline.ts'
import { pinsAt, stepVisitDay, visitsOnDay } from './dayPins.ts'

// 日本時間の日時から訪問を作る（'2026-11-06 12:10' は JST）
const jst = (s: string) => Date.parse(`${s.replace(' ', 'T')}:00+09:00`)
const v = (shopId: string, when: string, o: Partial<VisitEntry> = {}): VisitEntry => ({
  shopId, name: `店${shopId}`, kind: 'ramen', photoUrl: null, day: when.slice(0, 10), at: jst(when),
  lat: 35, lng: 139, wasHint: false, mysteryHint: false, ...o,
})

test('pinsAt: その日に行ったお店だけ、回った順の番号つき（前の日の店は出さない）', () => {
  const pins = pinsAt([v('A', '2026-11-05 10:00'), v('C', '2026-11-06 15:40'), v('B', '2026-11-06 12:10')], jst('2026-11-06 20:00'))
  expect(pins.map((p) => [p.shopId, p.order])).toEqual([['B', 1], ['C', 2]])
})

test('pinsAt: 行っていない日はピンなし', () => {
  expect(pinsAt([v('A', '2026-11-05 10:00')], jst('2026-11-06 12:00'))).toEqual([])
})

test('pinsAt: 同じ店に2回は1つ', () => {
  const pins = pinsAt([v('A', '2026-11-05 10:00'), v('A', '2026-11-06 10:00')], jst('2026-11-06 20:00'))
  expect(pins).toHaveLength(1)
  expect(pins[0]).toMatchObject({ order: 1, lastDay: '2026-11-06' })
})

test('pinsAt: 日本時間の境目（UTC 15:30 は翌日）', () => {
  const late = { ...v('A', '2026-11-06 00:30'), at: Date.parse('2026-11-05T15:30:00Z'), day: '2026-11-06' }
  expect(pinsAt([late], jst('2026-11-06 12:00'))[0].today).toBe(true)
})

test('pinsAt: 位置の無い店と、その日より後の店は出ない', () => {
  const pins = pinsAt([v('A', '2026-11-06 10:00', { lat: null, lng: null }), v('B', '2026-11-07 10:00')], jst('2026-11-06 12:00'))
  expect(pins).toEqual([])
})

test('stepVisitDay: 行った日へ跳ぶ・端で止まる', () => {
  const visits = [v('A', '2026-11-01 09:00'), v('B', '2026-11-06 12:10'), v('C', '2026-11-06 15:40')]
  const range = { start: jst('2026-10-30 00:00'), end: jst('2026-11-08 00:00') }
  expect(stepVisitDay(jst('2026-11-03 12:00'), 1, visits, range)).toBe(jst('2026-11-06 15:40'))
  expect(stepVisitDay(jst('2026-11-03 12:00'), -1, visits, range)).toBe(jst('2026-11-01 09:00'))
  expect(stepVisitDay(jst('2026-11-06 15:40'), 1, visits, range)).toBe(jst('2026-11-06 15:40'))
  expect(stepVisitDay(jst('2026-11-06 10:00'), -1, visits, range)).toBe(jst('2026-11-01 09:00'))
})

test('stepVisitDay: 訪問が無ければ1週ずつ', () => {
  const range = { start: jst('2026-10-01 00:00'), end: jst('2026-11-08 00:00') }
  expect(stepVisitDay(jst('2026-10-10 00:00'), 1, [], range)).toBe(jst('2026-10-17 00:00'))
})

test('visitsOnDay: その日の訪問を時刻順に', () => {
  const list = visitsOnDay([v('C', '2026-11-06 15:40'), v('A', '2026-11-05 10:00'), v('B', '2026-11-06 12:10')], jst('2026-11-06 08:00'))
  expect(list.map((x) => x.shopId)).toEqual(['B', 'C'])
})
