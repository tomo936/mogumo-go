// お知らせ・プレゼントの読み書き（SQL 関数 my_notices・my_presents・claim_present。supabase/migrations/0011_inbox.sql）。
// 失敗してもアプリは止めない: 読みは空、受け取りは null を返す
import { parseClaimResult, parseNotices, parsePresents } from '../domain/inbox.ts'
import type { ClaimResult, Notice, Present } from '../domain/inbox.ts'

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }
const client = async (c?: Rpc): Promise<Rpc> => c ?? ((await import('../../lib/supabase.ts')).supabase as unknown as Rpc)

async function call(fn: string, args: Record<string, unknown> | undefined, c?: Rpc): Promise<unknown> {
  try {
    const { data, error } = await (await client(c)).rpc(fn, args)
    return error ? null : data
  } catch {
    return null
  }
}

export async function loadInbox(c?: Rpc): Promise<{ notices: Notice[]; presents: Present[] }> {
  const [n, p] = await Promise.all([call('my_notices', undefined, c), call('my_presents', undefined, c)])
  return { notices: parseNotices(n), presents: parsePresents(p) }
}

export async function claimPresent(id: number, c?: Rpc): Promise<ClaimResult | null> {
  return parseClaimResult(await call('claim_present', { p_present_id: id }, c))
}
