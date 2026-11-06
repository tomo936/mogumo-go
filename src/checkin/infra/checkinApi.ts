// チェックインの Edge Function（checkin）呼び出しと、保存済みの進み具合の読み込み。
// 自動で再送しない（コインの二重取りを避ける）。
import type { Cell } from '../../fog/domain/grid.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { jstDay } from '../domain/day.ts'

export type CheckinResult =
  | { ok: true; checkinId: string; coins: 30 | 0; newCells: Cell[] }
  | { ok: false; reason: 'too_far' | 'network' | 'not_found' | 'no_profile' | 'already_today' }

const fail = (reason: 'too_far' | 'network' | 'not_found' | 'no_profile' | 'already_today'): CheckinResult => ({ ok: false, reason })

const TIMEOUT_MS = 25000

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

// supabase は読み込み時に環境変数を要求するので、使う時に読む
const sessionToken = async () =>
  (await (await import('../../lib/supabase.ts')).supabase.auth.getSession()).data.session?.access_token ?? null

function parseOk(json: unknown): CheckinResult {
  if (!isObj(json) || typeof json.checkin_id !== 'string' || (json.coins_awarded !== 30 && json.coins_awarded !== 0)) return fail('network')
  if (!Array.isArray(json.new_cells)) return fail('network')
  const newCells: Cell[] = []
  for (const c of json.new_cells) {
    if (!Array.isArray(c) || !isInt(c[0]) || !isInt(c[1])) return fail('network')
    newCells.push({ x: c[0], y: c[1] })
  }
  return { ok: true, checkinId: json.checkin_id, coins: json.coins_awarded, newCells }
}

export async function postCheckin(
  input: { shopId: string; me: LatLng; farFromHome: boolean; mapId?: string | null },
  opts: {
    fetchFn?: typeof fetch
    endpoint?: string
    anonKey?: string
    getToken?: () => Promise<string | null>
  } = {},
): Promise<CheckinResult> {
  const fetchFn = opts.fetchFn ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const token = await (opts.getToken ?? sessionToken)()
    if (!token) return fail('network')
    const res = await fetchFn(opts.endpoint ?? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: opts.anonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        shop_id: input.shopId,
        lat: input.me.lat,
        lng: input.me.lng,
        far_from_home: input.farFromHome,
        ...(input.mapId ? { map_id: input.mapId } : {}),
      }),
      signal: ctrl.signal,
    })
    if (res.status === 403) return fail('too_far')
    if (res.status === 404) return fail('not_found')
    if (res.status === 409) {
      // 409 は「プロフィールが無い」か「このお店は今日もう済み」。本文の error で分ける
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null
      return fail(body?.error === 'already_today' ? 'already_today' : 'no_profile')
    }
    if (!res.ok) return fail('network')
    return parseOk(await res.json())
  } catch {
    return fail('network') // 通信失敗・タイムアウト・JSON が読めない
  } finally {
    clearTimeout(timer)
  }
}

type Rows = PromiseLike<{ data: unknown; error: unknown }>
type Query = { order(column: string): Query; range(from: number, to: number): Rows }
type ProgressClient = { from(table: string): { select(columns: string): Query } }

const PAGE_SIZE = 1000 // Supabase は 1 回の応答を 1000 行までに切る

// 1000 行ずつ、1000 行未満の頁が来るまで読む。並びを固定して頁の抜け・重なりを防ぐ
async function readAll(c: ProgressClient, table: string, columns: string, order: string[]): Promise<unknown[]> {
  const out: unknown[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = c.from(table).select(columns)
    for (const o of order) q = q.order(o)
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1)
    if (error || !Array.isArray(data)) throw new Error('progress_unavailable')
    out.push(...data)
    if (data.length < PAGE_SIZE) return out
  }
}

// 自分の行だけが返る（RLS）。失敗したら throw して呼び出し側に任せる
export async function loadProgress(
  client?: ProgressClient,
): Promise<{ cells: Cell[]; checkedShopIds: Set<string>; lastDayByShop: Map<string, string> }> {
  const c = client ?? ((await import('../../lib/supabase.ts')).supabase as unknown as ProgressClient)
  const [cellRows, shopRows] = await Promise.all([
    readAll(c, 'fog_cells', 'cell_x, cell_y', ['cell_x', 'cell_y']),
    readAll(c, 'checkins', 'shop_id, checked_in_at', ['shop_id', 'checked_in_at']),
  ])
  // お店ごとの、いちばん新しいチェックインの日（日本時間）。「今日はもう済み」の表示に使う
  const lastDayByShop = new Map<string, string>()
  for (const r of shopRows as { shop_id: string; checked_in_at?: string }[]) {
    if (!r.checked_in_at) continue
    const day = jstDay(new Date(r.checked_in_at))
    const prev = lastDayByShop.get(r.shop_id)
    if (!prev || day > prev) lastDayByShop.set(r.shop_id, day)
  }
  return {
    cells: (cellRows as { cell_x: number; cell_y: number }[]).map((r) => ({ x: r.cell_x, y: r.cell_y })),
    checkedShopIds: new Set((shopRows as { shop_id: string }[]).map((r) => r.shop_id)),
    lastDayByShop,
  }
}
