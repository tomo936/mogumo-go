// メンテの様子を読む（SQL 関数 maintenance_status。ログイン前でも読める）。
// 読めないとき（電波が悪いなど）は null を返し、アプリは止めない
import { parseStatus } from '../domain/maintenance.ts'
import type { MaintenanceStatus } from '../domain/maintenance.ts'

type Rpc = { rpc(fn: string): PromiseLike<{ data: unknown; error: unknown }> }
const client = async (c?: Rpc): Promise<Rpc> => c ?? ((await import('../../lib/supabase.ts')).supabase as unknown as Rpc)

export async function loadMaintenance(c?: Rpc): Promise<MaintenanceStatus | null> {
  try {
    const { data, error } = await (await client(c)).rpc('maintenance_status')
    return error ? null : parseStatus(data)
  } catch {
    return null
  }
}
