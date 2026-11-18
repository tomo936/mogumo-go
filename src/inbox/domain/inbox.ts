// お知らせ・プレゼント（A7）の決まり。サーバーは supabase/migrations/0011_inbox.sql。
// 設計: docs/superpowers/specs/2026-11-17-inbox-design.md

export type Notice = { id: number; title: string; body: string; at: string }
export type Present = { id: number; title: string; message: string; coins: number; expiresAt: string; claimed: boolean }
export type ClaimStatus = 'ok' | 'already' | 'expired' | 'not_found'
export type ClaimResult = { coins: number; status: ClaimStatus }
export type InboxTab = 'notices' | 'presents'

type Row = Record<string, unknown>
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === 'object') : [])
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isStr = (v: unknown): v is string => typeof v === 'string'

export function parseNotices(v: unknown): Notice[] {
  return rows(v).flatMap((r) =>
    isInt(r.notice_id, 1, Number.MAX_SAFE_INTEGER) && isStr(r.title) && isStr(r.body) && isStr(r.starts_at)
      ? [{ id: r.notice_id, title: r.title, body: r.body, at: r.starts_at }]
      : [],
  )
}

export function parsePresents(v: unknown): Present[] {
  return rows(v).flatMap((r) =>
    isInt(r.present_id, 1, Number.MAX_SAFE_INTEGER) && isStr(r.title) && isStr(r.message) && isInt(r.coins, 1, 10000) && isStr(r.expires_at) && typeof r.claimed === 'boolean'
      ? [{ id: r.present_id, title: r.title, message: r.message, coins: r.coins, expiresAt: r.expires_at, claimed: r.claimed }]
      : [],
  )
}

const STATUSES: readonly string[] = ['ok', 'already', 'expired', 'not_found']
export function parseClaimResult(v: unknown): ClaimResult | null {
  const r = rows(v)[0]
  if (!r || !isInt(r.coins_awarded, 0, 10000) || !isStr(r.status) || !STATUSES.includes(r.status)) return null
  return { coins: r.coins_awarded, status: r.status as ClaimStatus }
}

// 手紙のボタンの赤い点
export function hasDot(notices: readonly Notice[], read: ReadonlySet<number>, presents: readonly Present[]): boolean {
  return notices.some((n) => !read.has(n.id)) || presents.some((p) => !p.claimed)
}

export function firstTab(presents: readonly Present[]): InboxTab {
  return presents.some((p) => !p.claimed) ? 'presents' : 'notices'
}

const HOUR = 3_600_000
export function expiryText(expiresAt: string, now: Date): string {
  const left = new Date(expiresAt).getTime() - now.getTime()
  if (!(left > 0)) return '期限切れ'
  if (left >= 24 * HOUR) return `あと${Math.floor(left / (24 * HOUR))}日`
  if (left >= HOUR) return `あと${Math.floor(left / HOUR)}時間`
  return 'まもなく終了'
}
