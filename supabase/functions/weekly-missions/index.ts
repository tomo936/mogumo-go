// Supabase Edge Function（Deno）。週ミッション（1週3つ）。
// 受け取る: POST { draw?: { kinds: { [種類]: 軒数 }, has_home: boolean } }（JWT 必須）。ユーザーは JWT からだけ決める。
//   draw: 気配のシートを開いたときだけ付ける。その週の行が無ければ、ここで3つ出題する。
//   draw なし: チェックインのあと。数え直しだけ（その週の行が無ければ空を返す）。
//   位置・距離・店の id は受け取らない（まわりのお店の種類と軒数、自宅を置いているかだけ）。
// すること: 自分のチェックインの記録から進みを数え直し、settle_weekly_missions で書く（下がらない・達成とコインは1回だけ）。
// 返す: { week_start, week_end, missions: [{ mission_id, difficulty, condition_type, params, target, progress, reward, completed }], newly: [mission_id] }
// 設計: docs/superpowers/specs/2026-11-10-weekly-missions-design.md
// プライバシー: ユーザーID・店ID・位置をログに出さない。
import { createClient } from 'npm:@supabase/supabase-js@2'
import { countProgress, drawMissions, parseDraw, weekEndMs, weekLastDay, weekStart, weekStartMs } from './core.ts'
import type { ConditionType, MissionRow, Visit } from './core.ts'
import type { ShopKind } from './kind.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const PAGE = 1000
const IN_CHUNK = 100

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (error: string, status: number) => json({ error }, status)

type Db = ReturnType<typeof createClient>
type Row = {
  mission_id: string; difficulty: string; condition_type: ConditionType; condition_params: { key?: string; kinds?: ShopKind[] } | null
  target: number; progress: number; reward: number; completed_at: string | null; created_at: string
}
const COLS = 'mission_id, difficulty, condition_type, condition_params, target, progress, reward, completed_at, created_at'
const ORDER = ['easy', 'normal', 'hard']

async function readWeek(db: Db, userId: string, week: string): Promise<Row[]> {
  const { data, error } = await db.from('weekly_missions').select(COLS).eq('user_id', userId).eq('week_start', week)
  if (error) throw new Error('read')
  return ((data ?? []) as Row[]).sort((a, b) => ORDER.indexOf(a.difficulty) - ORDER.indexOf(b.difficulty))
}

// その週の出題以降のチェックイン（＋同じ店に前に行ったかを見るため、その店の古い訪問も）
async function readVisits(db: Db, userId: string, fromIso: string, toIso: string): Promise<Visit[]> {
  type C = { shop_id: string; checked_in_at: string; was_hint: boolean; far_from_home: boolean }
  const inWeek: C[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('checkins').select('shop_id, checked_in_at, was_hint, far_from_home')
      .eq('user_id', userId).gte('checked_in_at', fromIso).lt('checked_in_at', toIso).order('checked_in_at').range(from, from + PAGE - 1)
    if (error) throw new Error('read')
    inWeek.push(...((data ?? []) as C[]))
    if (!data || data.length < PAGE) break
  }
  if (inWeek.length === 0) return []
  const ids = [...new Set(inWeek.map((c) => c.shop_id))]
  const shops = new Map<string, { name: string; genre_code: string | null; genre_name: string | null }>()
  const older: C[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const part = ids.slice(i, i + IN_CHUNK)
    const s = await db.from('shops').select('shop_id, name, genre_code, genre_name').in('shop_id', part)
    if (s.error) throw new Error('read')
    for (const r of (s.data ?? []) as { shop_id: string; name: string; genre_code: string | null; genre_name: string | null }[]) shops.set(r.shop_id, r)
    // 前に行ったか（1軒につき一番古い1回で足りる。上限は軒数ぶん）
    const o = await db.from('checkins').select('shop_id, checked_in_at, was_hint, far_from_home')
      .eq('user_id', userId).in('shop_id', part).lt('checked_in_at', fromIso).order('checked_in_at').limit(PAGE)
    if (o.error) throw new Error('read')
    older.push(...((o.data ?? []) as C[]))
  }
  return [...older, ...inWeek].map((c) => {
    const s = shops.get(c.shop_id)
    return {
      shopId: c.shop_id, at: Date.parse(c.checked_in_at), wasHint: c.was_hint, far: c.far_from_home,
      genreCode: s?.genre_code ?? null, genreName: s?.genre_name ?? null, name: s?.name ?? '',
    }
  })
}

async function countFog(db: Db, userId: string, fromIso: string, toIso: string): Promise<number> {
  const { count, error } = await db.from('fog_cells').select('cell_x', { count: 'exact', head: true })
    .eq('user_id', userId).eq('source', 'shop_radius').gte('cleared_at', fromIso).lt('cleared_at', toIso)
  if (error) throw new Error('read')
  return count ?? 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return fail('bad_request', 400)

  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail('unauthorized', 401)
  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const draw = typeof body === 'object' && body !== null && 'draw' in body ? parseDraw((body as { draw: unknown }).draw) : null

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth.user) return fail('unauthorized', 401)
  const userId = auth.user.id

  try {
    const nowMs = Date.now()
    const week = weekStart(nowMs)
    const out = { week_start: week, week_end: weekLastDay(week) }
    let rows = await readWeek(db, userId, week)

    // 1. 出題（シートを開いたときだけ）
    if (rows.length === 0 && draw) {
      const drafts = drawMissions({ ...draw, nowMs }, Math.random)
      const p = drafts.map((d) => ({
        difficulty: d.difficulty, family: d.family, condition_type: d.type, target: d.target, reward: d.reward,
        params: d.kinds.length > 0 ? { key: d.key, kinds: d.kinds } : { key: d.key },
      }))
      const { error } = await db.rpc('create_weekly_missions', { p_user: userId, p_week: week, p_rows: p })
      if (error) {
        if (error.code === '23503') return fail('no_profile', 409)
        throw new Error('create')
      }
      rows = await readWeek(db, userId, week)
    }
    if (rows.length === 0) return json({ ...out, missions: [], newly: [] }, 200)

    // 2. 数え直す（出題の時刻から週の終わりまで）
    const fromMs = Math.max(weekStartMs(week), Math.min(...rows.map((r) => Date.parse(r.created_at))))
    const fromIso = new Date(fromMs).toISOString()
    const toIso = new Date(weekEndMs(week)).toISOString()
    const visits = await readVisits(db, userId, fromIso, toIso)
    const fog = rows.some((r) => r.condition_type === 'fog_cells') ? await countFog(db, userId, fromIso, toIso) : 0
    const progress = rows.map((r) => {
      const m: MissionRow = { type: r.condition_type, target: r.target, kinds: r.condition_params?.kinds ?? [], createdAt: Date.parse(r.created_at) }
      return { mission_id: r.mission_id, progress: countProgress(m, week, visits, fog) }
    })

    // 3. 書く（下がらない・達成とコインは1回だけ）
    const { data: settled, error: settleError } = await db.rpc('settle_weekly_missions', { p_user: userId, p_week: week, p_progress: progress })
    if (settleError) throw new Error('settle')
    const byId = new Map(((settled ?? []) as { mission_id: string; progress: number; completed_at: string | null; newly_completed: boolean }[]).map((s) => [s.mission_id, s]))

    return json({
      ...out,
      missions: rows.map((r) => {
        const s = byId.get(r.mission_id)
        return {
          mission_id: r.mission_id, difficulty: r.difficulty, condition_type: r.condition_type, params: r.condition_params ?? {},
          target: r.target, progress: s?.progress ?? r.progress, reward: r.reward, completed: (s?.completed_at ?? r.completed_at) !== null,
        }
      }),
      newly: [...byId.values()].filter((s) => s.newly_completed).map((s) => s.mission_id),
    }, 200)
  } catch {
    console.error('weekly-missions: failed')
    return fail('server_error', 500)
  }
})
