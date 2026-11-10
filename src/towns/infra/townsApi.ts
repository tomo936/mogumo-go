// 町の機能のサーバー呼び出し。
// - syncTowns: Edge Function `towns`（行ったお店の町を調べる・お店を数える・クリアとコンプリートを判定する）。
//   体は空（現在地も自宅も送らない。サーバーは自分のチェックインの記録だけを見る）。
// - loadClearedTowns: クリアした町の形（地図と記録の霧を晴らすため）。自分の行だけが返る（RLS）。
import { SYNC_INTERVAL_MS, SYNC_MAX } from '../config.ts'
import { parseSync } from '../domain/progress.ts'
import type { TownSync } from '../domain/progress.ts'
import { bboxOf, isGeometry } from '../domain/shape.ts'
import type { ClearedTown } from '../domain/shape.ts'

const TIMEOUT_MS = 25000

// supabase は読み込み時に環境変数を要求するので、使う時に読む
const sessionToken = async () =>
  (await (await import('../../lib/supabase.ts')).supabase.auth.getSession()).data.session?.access_token ?? null

// 失敗（通信・時間切れ・ログインなし・返事の形が違う）は null。throw しない
export async function syncTowns(
  opts: { fetchFn?: typeof fetch; endpoint?: string; anonKey?: string; getToken?: () => Promise<string | null> } = {},
): Promise<TownSync | null> {
  const fetchFn = opts.fetchFn ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const token = await (opts.getToken ?? sessionToken)()
    if (!token) return null
    const res = await fetchFn(opts.endpoint ?? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/towns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: opts.anonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return parseSync(await res.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// サーバーが「続きがある」（more）と言うあいだ、間をあけて呼び直す。返事のたびに onUpdate。
// 失敗（null）・上限・alive が false で止める
export async function syncUntilSettled(
  onUpdate: (s: TownSync) => void,
  opts: { sync?: () => Promise<TownSync | null>; wait?: (ms: number) => Promise<void>; max?: number; alive?: () => boolean } = {},
): Promise<void> {
  const sync = opts.sync ?? syncTowns
  const wait = opts.wait ?? sleep
  const max = opts.max ?? SYNC_MAX
  const alive = opts.alive ?? (() => true)
  for (let i = 0; i < max; i++) {
    if (i > 0) await wait(SYNC_INTERVAL_MS)
    if (!alive()) return
    const s = await sync()
    if (!s || !alive()) return
    onUpdate(s)
    if (!s.more) return
  }
}

type Rows = PromiseLike<{ data: unknown; error: unknown }>
type Query = { order(c: string): Query; range(from: number, to: number): Rows }
export type TownsClient = {
  from(table: string): {
    select(columns: string): Query & { in(column: string, values: string[]): Rows }
  }
}
const PAGE = 1000
const IN_CHUNK = 100

// クリアした町（形つき）。古い順。失敗したら throw（呼び出し側が「町なし」で続ける）
export async function loadClearedTowns(client?: TownsClient): Promise<ClearedTown[]> {
  const c = client ?? ((await import('../../lib/supabase.ts')).supabase as unknown as TownsClient)
  const at = new Map<string, number>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c.from('town_conquests').select('town_id, conquered_at').order('town_id').range(from, from + PAGE - 1)
    if (error || !Array.isArray(data)) throw new Error('towns_unavailable')
    for (const r of data as Record<string, unknown>[]) {
      const t = typeof r.conquered_at === 'string' ? Date.parse(r.conquered_at) : NaN
      if (typeof r.town_id === 'string' && Number.isFinite(t)) at.set(r.town_id, t)
    }
    if (data.length < PAGE) break
  }
  const ids = [...at.keys()]
  const towns: ClearedTown[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await c.from('towns').select('town_id, name, city_name, area_m2, boundary').in('town_id', ids.slice(i, i + IN_CHUNK))
    if (error || !Array.isArray(data)) throw new Error('towns_unavailable')
    for (const r of data as Record<string, unknown>[]) {
      const t = typeof r.town_id === 'string' ? at.get(r.town_id) : undefined
      if (typeof r.town_id !== 'string' || t === undefined || typeof r.name !== 'string' || !isGeometry(r.boundary)) continue
      towns.push({
        id: r.town_id,
        name: r.name,
        city: typeof r.city_name === 'string' && r.city_name !== '' ? r.city_name : null,
        areaM2: typeof r.area_m2 === 'number' && Number.isFinite(r.area_m2) ? r.area_m2 : 0,
        at: t,
        geom: r.boundary,
        bbox: bboxOf(r.boundary),
      })
    }
  }
  return towns.sort((a, b) => a.at - b.at)
}
