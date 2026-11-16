// ログインボーナスの受け取り（SQL 関数 claim_login_bonus・login_bonus_state。supabase/migrations/0009_login_bonus.sql）。
// 失敗してもアプリは止めない（ボーナスが出ないだけ）ので、throw せず null を返す
import { parseClaim, parseState } from '../domain/loginBonus.ts'
import type { Claim, LoginBonusState } from '../domain/loginBonus.ts'

type Rpc = { rpc(fn: string): PromiseLike<{ data: unknown; error: unknown }> }
const client = async (c?: Rpc): Promise<Rpc> => c ?? ((await import('../../lib/supabase.ts')).supabase as unknown as Rpc)

export async function claimLoginBonus(c?: Rpc): Promise<Claim | null> {
  try {
    const { data, error } = await (await client(c)).rpc('claim_login_bonus')
    return error ? null : parseClaim(data)
  } catch {
    return null
  }
}

export async function loadLoginBonusState(c?: Rpc): Promise<LoginBonusState | null> {
  try {
    const { data, error } = await (await client(c)).rpc('login_bonus_state')
    return error ? null : parseState(data)
  } catch {
    return null
  }
}
