// グルメコインの残り（coin_ledger の amount の合計）。自分の行だけが返る（RLS）。失敗したら throw
type Rows = PromiseLike<{ data: unknown; error: unknown }>
type Query = { order(c: string): Query; range(from: number, to: number): Rows }
type Client = { from(table: string): { select(columns: string): Query } }
const PAGE = 1000

export async function loadCoins(client?: Client): Promise<number> {
  const c = client ?? ((await import('../../lib/supabase.ts')).supabase as unknown as Client)
  let total = 0
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c.from('coin_ledger').select('amount').order('created_at').range(from, from + PAGE - 1)
    if (error || !Array.isArray(data)) throw new Error('coins_unavailable')
    for (const r of data as { amount?: unknown }[]) if (typeof r.amount === 'number') total += r.amount
    if (data.length < PAGE) return total
  }
}
