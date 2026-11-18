import { describe, expect, it } from 'vitest'
import { addVisit, frameTier, mergeVisits, nextTier, summarizeVisits } from './visits.ts'

describe('summarizeVisits', () => {
  it('店ごとに回数・最初・最後の日（日本時間）をまとめる', () => {
    const m = summarizeVisits([
      { shop_id: 'hp:A', checked_in_at: '2026-11-08T03:00:00Z' },
      { shop_id: 'hp:A', checked_in_at: '2026-11-02T15:30:00Z' }, // JST では 11/3
      { shop_id: 'osm:1', checked_in_at: '2026-11-05T01:00:00Z' },
    ])
    expect(m.get('hp:A')).toEqual({ count: 2, firstDay: '2026-11-03', lastDay: '2026-11-08' })
    expect(m.get('osm:1')).toEqual({ count: 1, firstDay: '2026-11-05', lastDay: '2026-11-05' })
  })
})

describe('mergeVisits', () => {
  it('合体した店の2つの id の記録を合わせる', () => {
    expect(
      mergeVisits({ count: 2, firstDay: '2026-11-04', lastDay: '2026-11-08' }, { count: 1, firstDay: '2026-11-03', lastDay: '2026-11-03' }),
    ).toEqual({ count: 3, firstDay: '2026-11-03', lastDay: '2026-11-08' })
  })
  it('片方だけならそのまま、両方無ければ null', () => {
    const v = { count: 1, firstDay: '2026-11-03', lastDay: '2026-11-03' }
    expect(mergeVisits(undefined, v)).toEqual(v)
    expect(mergeVisits(undefined, undefined)).toBeNull()
  })
})

describe('addVisit', () => {
  it('はじめての1回', () => {
    expect(addVisit(undefined, '2026-11-09')).toEqual({ count: 1, firstDay: '2026-11-09', lastDay: '2026-11-09' })
  })
  it('回数を足して最後の日を進める', () => {
    expect(addVisit({ count: 2, firstDay: '2026-11-03', lastDay: '2026-11-08' }, '2026-11-09')).toEqual({ count: 3, firstDay: '2026-11-03', lastDay: '2026-11-09' })
  })
})

describe('枠の段', () => {
  it('1〜2回 ふつう／3〜9回 銀／10回〜 金', () => {
    expect(frameTier(1)).toBe('normal')
    expect(frameTier(2)).toBe('normal')
    expect(frameTier(3)).toBe('silver')
    expect(frameTier(9)).toBe('silver')
    expect(frameTier(10)).toBe('gold')
  })
  it('次の段まであと何回か（金なら null）', () => {
    expect(nextTier(2)).toEqual({ tier: 'silver', remaining: 1 })
    expect(nextTier(5)).toEqual({ tier: 'gold', remaining: 5 })
    expect(nextTier(10)).toBeNull()
  })
})
