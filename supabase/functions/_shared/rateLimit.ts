// 関数ごとの、ユーザー単位の回数の上限（2026-11-18 セキュリティ診断の 2）。数えるのは DB（SQL 0017 の rate_limit_hit）。
// 上限は「ふつうに遊んで届かない回数」にする（窓は 10 分）。数え損ねたときは止めない（遊べなくなる方が困るため）。
// Deno / npm の import は置かない（Vitest から読むため）。
const WINDOW_S = 600
export const LIMITS = {
  'shops-hotpepper': 40, // 1 回で最大 3 ページ（300 件）ホットペッパーを読む。歩いて 250m ごと＋起動のたび
  'shops-osm': 60,
  'daily-hints': 30,
  'weekly-missions': 60,
  towns: 150, // 1 回のチェックインで最大 15 回呼び直す
  checkin: 60,
  'delete-account': 5,
} as const
export type LimitKey = keyof typeof LIMITS

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

// 上限を超えたら true
export async function overLimit(db: Rpc, userId: string, key: LimitKey): Promise<boolean> {
  try {
    const { data, error } = await db.rpc('rate_limit_hit', { p_user: userId, p_key: key, p_window_s: WINDOW_S, p_max: LIMITS[key] })
    if (error) return false
    return data === false
  } catch {
    return false
  }
}
