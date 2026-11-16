// ログインボーナス（A4）の決まり。サーバー側（supabase/migrations/0009_login_bonus.sql）と同じ数字。
// 設計: docs/superpowers/specs/2026-11-17-login-bonus-design.md

export const STAMP_COINS = [10, 10, 10, 10, 10, 10, 50] as const // 1〜7 個目

export type LoginBonusState = { total: number; claimedToday: boolean } // total = これまでに受け取った日数
export type Claim = { stampNo: number; coins: number; claimedNow: boolean } // stampNo = 今日のスタンプの番号 1〜7

// 今のカード: filled = 押してあるスタンプの数（0〜7）、next = 次に押す所の番号（0 始まり。今日はもう押したなら null）
// 7 個そろった日はそのまま全部押してあり、次の日から新しいカード（0 個）
export function cardOf({ total, claimedToday }: LoginBonusState): { filled: number; next: number | null } {
  if (claimedToday) return { filled: total === 0 ? 0 : ((total - 1) % 7) + 1, next: null }
  const filled = total % 7
  return { filled, next: filled }
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

export function parseClaim(rows: unknown): Claim | null {
  const r = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined
  if (!r || !isInt(r.stamp_no, 1, 7) || !isInt(r.coins_awarded, 0, 50) || typeof r.claimed_now !== 'boolean') return null
  return { stampNo: r.stamp_no, coins: r.coins_awarded, claimedNow: r.claimed_now }
}

export function parseState(rows: unknown): LoginBonusState | null {
  const r = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined
  if (!r || !isInt(r.total, 0, 1_000_000) || typeof r.claimed_today !== 'boolean') return null
  return { total: r.total, claimedToday: r.claimed_today }
}
