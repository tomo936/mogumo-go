// 感想の決まり（SPEC S12・設計 2026-11-12-zukan-b-reviews）。何も import しない。
export const REVIEW_BODY_MAX = 500
export const REVIEWS_PAGE = 10

export type Review = {
  id: string
  checkinId: string
  shopId: string
  userId: string
  stars: number
  body: string | null
  photoPath: string | null
  isPublic: boolean
  createdAt: string
  nickname: string | null
}

export type Draft = { stars: number; body: string; isPublic: boolean }
export type DraftError = 'stars' | 'too_long'

export function validateDraft(d: Draft): { ok: true; stars: number; body: string | null; isPublic: boolean } | { ok: false; error: DraftError } {
  if (!Number.isInteger(d.stars) || d.stars < 1 || d.stars > 5) return { ok: false, error: 'stars' }
  const body = d.body.trim()
  if ([...body].length > REVIEW_BODY_MAX) return { ok: false, error: 'too_long' }
  return { ok: true, stars: d.stars, body: body === '' ? null : body, isPublic: d.isPublic === true }
}

export function summarize(stars: readonly number[]): { avg: number; count: number } | null {
  if (stars.length === 0) return null
  const sum = stars.reduce((s, n) => s + n, 0)
  return { avg: Math.round((sum / stars.length) * 10) / 10, count: stars.length }
}

export type VisitRef = { checkinId: string; checkedInAt: string }

const newestFirst = (visits: readonly VisitRef[]): VisitRef[] =>
  [...visits].sort((x, y) => (x.checkedInAt < y.checkedInAt ? 1 : x.checkedInAt > y.checkedInAt ? -1 : 0))

export function targetCheckin(visits: readonly VisitRef[], mine: readonly Review[]): { checkinId: string; existing: Review | null } | null {
  const latest = newestFirst(visits)[0]
  if (!latest) return null
  return { checkinId: latest.checkinId, existing: mine.find((r) => r.checkinId === latest.checkinId) ?? null }
}

export function myReviewsByVisit(visits: readonly VisitRef[], mine: readonly Review[]): Review[] {
  const out: Review[] = []
  for (const v of newestFirst(visits)) {
    const r = mine.find((m) => m.checkinId === v.checkinId)
    if (r) out.push(r)
  }
  return out
}
