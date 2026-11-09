// 気配の取得: 今日の組を直接読む（RLS で本人の行だけ）／Edge Function daily-hints を呼ぶ（作る・作り直す）。
// 自動で再送しない。本文は regen・hp・osm の3項目だけ（自宅・現在地は送らない）。
import type { Candidates } from '../domain/candidates.ts'
import type { DailyHint, HintSet } from '../domain/hint.ts'

export type HintsError = 'network' | 'no_profile' | 'regen_used' | 'regen_done' | 'no_hints' | 'not_far'

const TIMEOUT_MS = 25000

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const sessionToken = async () =>
  (await (await import('../../lib/supabase.ts')).supabase.auth.getSession()).data.session?.access_token ?? null

function parseShop(v: unknown): DailyHint['shop'] | null {
  if (!isObj(v) || typeof v.name !== 'string' || !isNum(v.lat) || !isNum(v.lng)) return null
  return { name: v.name, lat: v.lat, lng: v.lng }
}

function parseHint(v: unknown): DailyHint | null {
  if (!isObj(v)) return null
  const shop = parseShop(v.shop)
  if (
    !shop || typeof v.hint_id !== 'string' || !isInt(v.slot) || typeof v.shop_id !== 'string' ||
    !isStrOrNull(v.hint_genre) || !isStrOrNull(v.hint_catch) || !isStrOrNull(v.hint_budget) ||
    typeof v.is_mystery !== 'boolean' || typeof v.completed !== 'boolean'
  ) return null
  return {
    id: v.hint_id, slot: v.slot, shopId: v.shop_id, genre: v.hint_genre, catch: v.hint_catch, budget: v.hint_budget,
    isMystery: v.is_mystery, completed: v.completed, shop,
  }
}

// 返事の形が違えば（1件でも）null。hints が空の組は generation 0 の空の組として通す
export function parseHintSet(json: unknown): HintSet | null {
  if (!isObj(json) || typeof json.hint_date !== 'string' || !isInt(json.generation)) return null
  if (json.regen_left !== 0 && json.regen_left !== 1) return null
  if (!Array.isArray(json.hints)) return null
  const hints: DailyHint[] = []
  for (const h of json.hints) {
    const p = parseHint(h)
    if (!p) return null
    hints.push(p)
  }
  hints.sort((a, b) => a.slot - b.slot)
  return { day: json.hint_date, generation: json.generation, regenLeft: json.regen_left, hints }
}

type Result = { ok: true; set: HintSet } | { ok: false; reason: HintsError }
const fail = (reason: HintsError): Result => ({ ok: false, reason })

const CONFLICT: Record<string, HintsError> = {
  profile_missing: 'no_profile',
  regen_used: 'regen_used',
  regen_done: 'regen_done',
  no_hints: 'no_hints',
  not_far: 'not_far',
}

export async function postDailyHints(
  input: { regen: boolean; candidates: Candidates },
  opts: { fetchFn?: typeof fetch; endpoint?: string; anonKey?: string; getToken?: () => Promise<string | null> } = {},
): Promise<Result> {
  const fetchFn = opts.fetchFn ?? fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const token = await (opts.getToken ?? sessionToken)()
    if (!token) return fail('network')
    const res = await fetchFn(opts.endpoint ?? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-hints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: opts.anonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ regen: input.regen, hp: input.candidates.hp, osm: input.candidates.osm }),
      signal: ctrl.signal,
    })
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null
      const reason = typeof body?.error === 'string' ? CONFLICT[body.error] : undefined
      return fail(reason ?? 'network')
    }
    if (!res.ok) return fail('network')
    const set = parseHintSet(await res.json())
    return set ? { ok: true, set } : fail('network')
  } catch {
    return fail('network')
  } finally {
    clearTimeout(timer)
  }
}

type Rows = PromiseLike<{ data: unknown; error: unknown }>
export type HintsClient = { from(table: string): { select(columns: string): { eq(column: string, value: string): Rows } } }

const COLUMNS =
  'hint_id, slot, shop_id, generation, hint_genre, hint_catch, hint_budget, is_mystery, completed_checkin_id, shops(name, lat, lng)'

// その日の一番大きい generation の組を slot 順に。行が無ければ set: null。読めなければ ok:false
export async function readTodayHints(day: string, client?: HintsClient): Promise<{ ok: true; set: HintSet | null } | { ok: false }> {
  try {
    const c = client ?? ((await import('../../lib/supabase.ts')).supabase as unknown as HintsClient)
    const { data, error } = await c.from('daily_hints').select(COLUMNS).eq('hint_date', day)
    if (error || !Array.isArray(data)) return { ok: false }
    if (data.length === 0) return { ok: true, set: null }
    const rows = data as Record<string, unknown>[]
    const gens = rows.map((r) => r.generation)
    if (!gens.every(isInt)) return { ok: false }
    const generation = Math.max(...(gens as number[]))
    const hints: unknown[] = []
    for (const r of rows) {
      if (r.generation !== generation) continue
      const shop = Array.isArray(r.shops) ? r.shops[0] : r.shops
      hints.push({ ...r, completed: r.completed_checkin_id != null, shop })
    }
    const set = parseHintSet({ hint_date: day, generation, regen_left: generation === 1 ? 1 : 0, hints })
    return set ? { ok: true, set } : { ok: false }
  } catch {
    return { ok: false }
  }
}
