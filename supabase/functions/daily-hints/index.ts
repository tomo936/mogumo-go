// Supabase Edge Function（Deno）。今日の気配（設計 docs/superpowers/specs/2026-11-07-daily-hints-design.md §6）。
// 受け取る: POST { regen, hp, osm }（JWT 必須）。ユーザーは JWT からだけ決める。
// 端末が候補を送り、ここで確かめて抽選し、create_daily_hints で保存する。今日の組がすでにあれば、それを返すだけ。
// プライバシー: 自宅・現在地・距離は受け取らない。候補の一覧・位置・ユーザーID・トークンをログに出さない・保存しない。
// ホットペッパーには問い合わせない（鍵は使わない）。shops の控えと地図タイルだけを読む。
import { createClient } from 'npm:@supabase/supabase-js@2'
import { HINT_MYSTERY_VERIFY_TRIES, composeDraw, farEnough, hintRow, jstDay, parseRequest, planDraw, shuffle, toResponse } from './core.ts'
import type { HintRowOut, ShopLite } from './core.ts'
import { UpstreamError, verifyOsm } from './osmTile.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (error: string, status: number) => json({ error }, status)

const HINT_COLS = 'hint_id, slot, shop_id, generation, hint_genre, hint_catch, hint_budget, is_mystery, completed_checkin_id'
const SQL_ERRORS = ['no_hints', 'regen_used', 'regen_done']

type ShopPos = { name: string; lat: number; lng: number }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return fail('bad_request', 400)

  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail('unauthorized', 401)

  let input: ReturnType<typeof parseRequest>
  try {
    input = parseRequest(await req.json())
  } catch {
    return fail('bad_request', 400)
  }
  if (!input) return fail('bad_request', 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth.user) return fail('unauthorized', 401)
  const userId = auth.user.id
  const day = jstDay(new Date()) // どの日かの正本はサーバー

  // 店の名前と位置（返事に付ける）
  async function shopsOf(ids: string[]): Promise<Map<string, ShopPos>> {
    const out = new Map<string, ShopPos>()
    if (ids.length === 0) return out
    const { data, error } = await db.from('shops').select('shop_id, name, lat, lng').in('shop_id', ids)
    if (error) throw new Error('shops read')
    for (const s of data ?? []) out.set(s.shop_id, { name: s.name, lat: s.lat, lng: s.lng })
    return out
  }

  try {
    // 1. 今日の行を読み、一番大きい generation の組（今の組）だけ残す。店の名前・位置も一緒に読む
    const { data: todayRows, error: readError } = await db
      .from('daily_hints')
      .select(`${HINT_COLS}, shops(name, lat, lng)`)
      .eq('user_id', userId)
      .eq('hint_date', day)
    if (readError) throw new Error('daily_hints read')
    const gen = (todayRows ?? []).reduce((g: number, r: { generation: number }) => Math.max(g, r.generation), 0)
    const current: HintRowOut[] = []
    const currentShops = new Map<string, ShopPos>()
    for (const r of todayRows ?? []) {
      if (r.generation !== gen) continue
      current.push({
        hint_id: r.hint_id, slot: r.slot, shop_id: r.shop_id, generation: r.generation, hint_genre: r.hint_genre,
        hint_catch: r.hint_catch, hint_budget: r.hint_budget, is_mystery: r.is_mystery, completed_checkin_id: r.completed_checkin_id,
      })
      const s = Array.isArray(r.shops) ? r.shops[0] : r.shops
      if (s) currentShops.set(r.shop_id, { name: s.name, lat: s.lat, lng: s.lng })
    }
    const respondCurrent = () => json(toResponse(day, current, currentShops), 200)

    // 2. 作り直しでなく今日の組があれば、それを返して終わり（候補は見ない）
    if (!input.regen && current.length > 0) return respondCurrent()

    // 3. 作り直しの事前の確かめ（安い順）。SQL 関数でももう一度確かめる
    if (input.regen) {
      if (current.length === 0) return fail('no_hints', 409)
      if (gen >= 2) return fail('regen_used', 409)
      if (current.some((r) => r.completed_checkin_id !== null)) return fail('regen_done', 409)
    }

    // 4. 候補を確かめる（端末の言うことは信じない）
    let hpShops: ShopLite[] = []
    if (input.hp.length > 0) {
      const { data, error } = await db
        .from('shops')
        .select('shop_id, name, lat, lng, genre_name, catch, budget_name')
        .in('shop_id', input.hp)
      if (error) throw new Error('shops read')
      hpShops = (data ?? []).filter((s: ShopLite) => typeof s.name === 'string' && s.name.trim() !== '')
    }
    let osmCands = input.osm
    const candIds = [...hpShops.map((s) => s.shop_id), ...osmCands.map((c) => c.id)]
    if (candIds.length > 0) {
      const { data, error } = await db.from('checkins').select('shop_id').eq('user_id', userId).in('shop_id', candIds)
      if (error) throw new Error('checkins read')
      const visited = new Set((data ?? []).map((c: { shop_id: string }) => c.shop_id))
      hpShops = hpShops.filter((s) => !visited.has(s.shop_id))
      osmCands = osmCands.filter((c) => !visited.has(c.id))
    }
    // 作り直しは、新しい候補の重心が今の組から離れているときだけ（候補が0件なら下で今の組を返す）
    if (input.regen && hpShops.length + osmCands.length > 0) {
      if (!farEnough([...currentShops.values()], [...hpShops, ...osmCands])) return fail('not_far', 409)
    }

    // 5. 抽選
    const hpOrder = shuffle(hpShops, Math.random)
    const osmOrder = shuffle(osmCands, Math.random)
    const plan = planDraw(hpOrder.length, osmOrder.length, Math.random)

    // 6. 謎の気配の店を地図タイルで確かめる（店の位置で。読めなければ hp で埋める）
    const osmOk: ShopLite[] = []
    for (const c of osmOrder.slice(0, plan.osm > 0 ? HINT_MYSTERY_VERIFY_TRIES : 0)) {
      if (osmOk.length >= plan.osm) break
      let poi: Awaited<ReturnType<typeof verifyOsm>> = null
      try {
        poi = await verifyOsm(c.id, c.lat, c.lng)
      } catch (e) {
        if (e instanceof UpstreamError) break
        throw e
      }
      if (poi) osmOk.push({ shop_id: c.id, name: poi.name, lat: poi.lat, lng: poi.lng, genre_name: poi.subclass, catch: null, budget_name: null })
    }
    if (osmOk.length > 0) {
      // checkin が地図の店を書くときと同じ列
      const { error } = await db.from('shops').upsert(
        osmOk.map((s) => ({ shop_id: s.shop_id, name: s.name, lat: s.lat, lng: s.lng, genre_name: s.genre_name, fetched_at: new Date().toISOString() })),
        { onConflict: 'shop_id' },
      )
      if (error) throw new Error('shops upsert')
    }

    const byId = new Map([...hpShops, ...osmOk].map((s) => [s.shop_id, s]))
    const ids = composeDraw({ hp: hpOrder.map((s) => s.shop_id), wantHp: plan.hp, osmOk: osmOk.map((s) => s.shop_id), wantOsm: plan.osm })
    const rows = shuffle(ids, Math.random).map((id, i) => hintRow(byId.get(id)!, i + 1, id.startsWith('osm:')))

    // 7. 0件は行を作らない（気配なし。作り直しなら今の組のまま、回数も使わない）
    if (rows.length === 0) return input.regen ? respondCurrent() : json(toResponse(day, [], new Map()), 200)

    // 8. 1トランザクションで書く。返ってきた行（先に別の要求が作った分のこともある）に店を付けて返す
    const { data, error } = await db.rpc('create_daily_hints', { p_user: userId, p_day: day, p_regen: input.regen, p_rows: rows })
    if (error) {
      if (error.code === '23503' && error.message.includes('profile_missing')) return fail('profile_missing', 409)
      if (error.code === 'P0001') {
        const code = SQL_ERRORS.find((c) => error.message.includes(c))
        if (code) return fail(code, 409)
      }
      throw new Error('create_daily_hints')
    }
    const saved = (Array.isArray(data) ? data : []) as HintRowOut[]
    return json(toResponse(day, saved, await shopsOf([...new Set(saved.map((r) => r.shop_id))])), 200)
  } catch {
    console.error('daily-hints failed')
    return fail('internal_error', 500)
  }
})
