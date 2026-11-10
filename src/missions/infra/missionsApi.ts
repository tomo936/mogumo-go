// 週ミッションのサーバー呼び出し（Edge Function `weekly-missions`）。
// draw をつけると、その週の行が無ければ出題する（気配のシートを開いたとき）。つけなければ数え直しだけ（チェックインのあと）。
// 送るのは、まわりのお店の種類と軒数・自宅を置いているかだけ（位置・距離・店の id は送らない）。
import { parseWeek } from '../domain/mission.ts'
import type { MissionWeek } from '../domain/mission.ts'
import type { ShopKind } from '../../shops/domain/shop.ts'

const TIMEOUT_MS = 20000

export type Draw = { kinds: Partial<Record<ShopKind, number>>; hasHome: boolean }

const sessionToken = async () =>
  (await (await import('../../lib/supabase.ts')).supabase.auth.getSession()).data.session?.access_token ?? null

// 失敗（通信・時間切れ・ログインなし・返事の形が違う）は null。throw しない
export async function syncMissions(
  draw: Draw | null,
  opts: { fetchFn?: typeof fetch; endpoint?: string; anonKey?: string; getToken?: () => Promise<string | null> } = {},
): Promise<MissionWeek | null> {
  const fetchFn = opts.fetchFn ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const token = await (opts.getToken ?? sessionToken)()
    if (!token) return null
    const res = await fetchFn(opts.endpoint ?? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weekly-missions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: opts.anonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(draw ? { draw: { kinds: draw.kinds, has_home: draw.hasHome } } : {}),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return parseWeek(await res.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
