import { describe, expect, it } from 'vitest'
import { myReviewsByVisit, REVIEW_BODY_MAX, summarize, targetCheckin, validateDraft } from './review.ts'
import type { Review, VisitRef } from './review.ts'

const rv = (id: string, checkinId: string): Review => ({
  id, checkinId, shopId: 'hp:A', userId: 'me', stars: 4, body: null, photoPath: null, isPublic: true, createdAt: '2026-11-03T03:00:00Z', nickname: null,
})
const a: VisitRef = { checkinId: 'a', checkedInAt: '2026-11-03T03:00:00Z' }
const b: VisitRef = { checkinId: 'b', checkedInAt: '2026-10-12T03:00:00Z' }

describe('validateDraft', () => {
  it('星は 1〜5 の整数だけ', () => {
    for (const stars of [0, 6, 3.5]) expect(validateDraft({ stars, body: '', isPublic: true })).toEqual({ ok: false, error: 'stars' })
  })
  it('空白だけのひとことは null', () => {
    expect(validateDraft({ stars: 4, body: '  ', isPublic: true })).toEqual({ ok: true, stars: 4, body: null, isPublic: true })
  })
  it('前後の空白を除き、500 文字まで', () => {
    expect(validateDraft({ stars: 5, body: ' おいしい ', isPublic: false })).toEqual({ ok: true, stars: 5, body: 'おいしい', isPublic: false })
    expect(validateDraft({ stars: 5, body: 'あ'.repeat(REVIEW_BODY_MAX), isPublic: true }).ok).toBe(true)
    expect(validateDraft({ stars: 5, body: 'あ'.repeat(REVIEW_BODY_MAX + 1), isPublic: true })).toEqual({ ok: false, error: 'too_long' })
  })
})

describe('summarize', () => {
  it('0 件は null、平均は小数 1 桁', () => {
    expect(summarize([])).toBeNull()
    expect(summarize([5, 4, 4])).toEqual({ avg: 4.3, count: 3 })
  })
})

describe('targetCheckin', () => {
  it('いちばん新しい訪問。感想があれば existing', () => {
    expect(targetCheckin([b, a], [rv('r1', 'b')])).toEqual({ checkinId: 'a', existing: null })
    const ra = rv('r2', 'a')
    expect(targetCheckin([a, b], [ra])).toEqual({ checkinId: 'a', existing: ra })
    expect(targetCheckin([], [])).toBeNull()
  })
})

describe('myReviewsByVisit', () => {
  it('訪問の新しい順。訪問に無い感想は出さない', () => {
    const rb = rv('r1', 'b'), ra = rv('r2', 'a'), rx = rv('r3', 'x')
    expect(myReviewsByVisit([b, a], [rb, rx, ra]).map((r) => r.id)).toEqual(['r2', 'r1'])
  })
})
