import { describe, expect, it } from 'vitest'
import { DAY_MS, areaKm2, clearedAt, groupByMonth, monthLabel, stepWeek, timeRange, type ClearedCell, type VisitEntry } from './timeline.ts'

const cell = (at: number): ClearedCell => ({ x: 0, y: 0, at })
const visit = (day: string, name = day): VisitEntry => ({ shopId: name, name, kind: 'ramen', photoUrl: null, day, at: Date.parse(`${day}T03:00:00Z`), lat: 35, lng: 139, wasHint: false, mysteryHint: false })

describe('timeRange / clearedAt', () => {
  it('範囲は最初と最後。マスが無ければ null', () => {
    expect(timeRange([])).toBeNull()
    expect(timeRange([cell(5), cell(1), cell(9)])).toEqual({ start: 1, end: 9 })
  })
  it('ほかの時刻（町をクリアした時刻）も範囲に入れる', () => {
    expect(timeRange([cell(5), cell(9)], [20])).toEqual({ start: 5, end: 20 })
    expect(timeRange([cell(5), cell(9)], [2, 7])).toEqual({ start: 2, end: 9 })
    expect(timeRange([], [7])).toEqual({ start: 7, end: 7 })
    expect(timeRange([], [])).toBeNull()
  })
  it('日付より前に晴れたマスだけ残る', () => {
    expect(clearedAt([cell(1), cell(5), cell(9)], 5).map((c) => c.at)).toEqual([1, 5])
  })
})

describe('areaKm2 / stepWeek', () => {
  it('1マス 25m × 25m = 625㎡、1600 マスで 1km²', () => {
    expect(areaKm2(1600)).toBeCloseTo(1, 6)
  })
  it('1週ずつ送れて、範囲の外には出ない', () => {
    const r = { start: 0, end: 10 * DAY_MS }
    expect(stepWeek(0, 1, r)).toBe(7 * DAY_MS)
    expect(stepWeek(7 * DAY_MS, 1, r)).toBe(10 * DAY_MS)
    expect(stepWeek(3 * DAY_MS, -1, r)).toBe(0)
  })
})

describe('groupByMonth', () => {
  it('月ごとにまとめ、新しい月・新しい日が先', () => {
    const g = groupByMonth([visit('2026-10-12'), visit('2026-11-03'), visit('2026-11-05'), visit('2026-10-02')])
    expect(g.map((x) => x.month)).toEqual(['2026年11月', '2026年10月'])
    expect(g[0].items.map((i) => i.day)).toEqual(['2026-11-05', '2026-11-03'])
    expect(g[1].items.map((i) => i.day)).toEqual(['2026-10-12', '2026-10-02'])
  })
  it('日付 t より後の日は入れない', () => {
    const t = Date.parse('2026-11-04T00:00:00+09:00')
    const g = groupByMonth([visit('2026-11-03'), visit('2026-11-05')], t)
    expect(g.flatMap((x) => x.items.map((i) => i.day))).toEqual(['2026-11-03'])
  })
  it('月の見出し', () => {
    expect(monthLabel('2026-11-03')).toBe('2026年11月')
  })
})
