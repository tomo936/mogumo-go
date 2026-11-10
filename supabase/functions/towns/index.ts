// Supabase Edge Function（Deno）。町のクリア・コンプリート。
// 受け取る: POST（本文なし。JWT 必須）。ユーザーは JWT からだけ決める。現在地は受け取らない。
// すること: 1) 行った店の町を決める（境目のファイル = バケット towns の g/<格子>.json.gz）
//           2) 町のお店を地図タイルから数えて towns.shops に覚える（1回に1つの町・最大 40 枚）
//           3) 行った数／全部の数 を判定し、grant_town でクリア（+100）・コンプリートを書く
// 返す: { towns: [{ id, name, city, visited, total, cleared_at, completed_at, counting, last_at }],
//         newly: [{ id, name, kind: 'clear'|'complete', coins, town: { city, area_m2, boundary, at } | null }], more }
//   more = まだ続きがある（アプリが数秒おいて呼び直す）。
// プライバシー: ユーザーID・店ID・町ID・位置をログに出さない。
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  CHUNKS_PER_CALL, SHOPS_PER_CALL, TILE_BATCH, TILE_Z, TILES_PER_CALL, TOWN_COINS,
  chunkKey, findTown, foodInTown, isChunk, mergeShops, needsCount, parseIndex, tilesForGeometry, townView,
} from './core.ts'
import type { ChunkTown, Conquest, CountState, Geometry, TownShop, TownView, UserShop } from './core.ts'
import { UpstreamError, fetchTileFood, tileTemplate } from './tiles.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const BUCKET = 'towns'
const PAGE = 1000 // Supabase は 1 回の応答を 1000 行までに切る
const IN_CHUNK = 100

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (error: string, status: number) => json({ error }, status)

type Db = ReturnType<typeof createClient>
type ShopRow = { shop_id: string; name: string; lat: number; lng: number; town_id: string | null; town_checked_at: string | null }
type TownDbRow = { town_id: string; name: string; city_name: string | null; shops: TownShop[] | null; counted_at: string | null; count_state: CountState | null }
type News = { id: string; name: string; kind: 'clear' | 'complete'; coins: number; town: { city: string | null; area_m2: number | null; boundary: Geometry; at: string } | null }

// バケットの JSON を読む（gzip ならほどく）。無い・読めないは null
async function readJson(db: Db, path: string): Promise<unknown> {
  const { data, error } = await db.storage.from(BUCKET).download(path)
  if (error || !data) return null
  try {
    const buf = new Uint8Array(await data.arrayBuffer())
    if (buf[0] !== 0x1f || buf[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(buf))
    return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
  } catch {
    return null
  }
}

// その人が行った店と、店ごとの最後の時刻
async function readVisits(db: Db, userId: string): Promise<Map<string, string>> {
  const last = new Map<string, string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('checkins').select('shop_id, checked_in_at').eq('user_id', userId)
      .order('checked_in_at').order('checkin_id').range(from, from + PAGE - 1)
    if (error || !data) throw new Error('checkins read')
    for (const r of data as { shop_id: string; checked_in_at: string }[]) last.set(r.shop_id, r.checked_in_at) // 古い順なので後のものが残る
    if (data.length < PAGE) return last
  }
}

async function readIn<T>(db: Db, table: string, columns: string, column: string, ids: string[]): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await db.from(table).select(columns).in(column, ids.slice(i, i + IN_CHUNK))
    if (error || !data) throw new Error(`${table} read`)
    out.push(...(data as T[]))
  }
  return out
}

// 町がまだ分かっていない店の町を決める。続きが残れば true
async function assignTowns(db: Db, shops: ShopRow[], now: string): Promise<boolean> {
  const pending = shops.filter((s) => s.town_id === null && s.town_checked_at === null)
  if (pending.length === 0) return false
  const known = parseIndex(await readJson(db, 'g/index.json'))
  if (!known) {
    // 境目のファイルがまだ置かれていない（か読めない）。「町なし」と決めずに、次の機会にやり直す
    console.error('towns: boundary index unavailable')
    return false
  }
  const groups = new Map<string, ShopRow[]>()
  for (const s of pending.slice(0, SHOPS_PER_CALL)) {
    const key = chunkKey(s.lat, s.lng)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  const keys = [...groups.keys()]
  let done = 0
  for (const key of keys.slice(0, CHUNKS_PER_CALL)) {
    const list = groups.get(key) ?? []
    let towns: ChunkTown[] = []
    if (known.has(key)) {
      const chunk = await readJson(db, `g/${key}.json.gz`)
      if (!isChunk(chunk)) {
        console.error('towns: boundary file unreadable')
        continue // 一時的な失敗かもしれないので、印を付けずに次の機会へ
      }
      towns = chunk.towns
    }
    const found = new Map<string, { town: ChunkTown; ids: string[] }>()
    const none: string[] = []
    for (const s of list) {
      const t = findTown(towns, s.lat, s.lng)
      if (!t) none.push(s.shop_id)
      else found.set(t.id, { town: t, ids: [...(found.get(t.id)?.ids ?? []), s.shop_id] })
    }
    for (const { town, ids } of found.values()) {
      const { error: townError } = await db.from('towns').upsert(
        {
          town_id: town.id, name: town.name, city_name: town.city, area_m2: town.area, boundary: town.geom,
          min_lng: town.bbox[0], min_lat: town.bbox[1], max_lng: town.bbox[2], max_lat: town.bbox[3],
        },
        { onConflict: 'town_id', ignoreDuplicates: true },
      )
      if (townError) throw new Error('towns insert')
      const { error } = await db.from('shops').update({ town_id: town.id, town_checked_at: now }).in('shop_id', ids)
      if (error) throw new Error('shops update')
      for (const s of list) if (ids.includes(s.shop_id)) s.town_id = town.id
    }
    if (none.length > 0) {
      // 海の上・データの外。次からは調べない
      const { error } = await db.from('shops').update({ town_checked_at: now }).in('shop_id', none)
      if (error) throw new Error('shops update')
    }
    for (const s of list) s.town_checked_at = now
    done += list.length
  }
  return done > 0 && done < pending.length
}

// 町のお店を数える（1回の呼び出しで1つの町・最大 TILES_PER_CALL 枚）。数え終われば true
async function countTown(db: Db, town: TownDbRow, now: string): Promise<boolean> {
  const { data, error } = await db.from('towns').select('boundary').eq('town_id', town.town_id).single()
  if (error || !data) throw new Error('towns read')
  const geom = (data as { boundary: Geometry }).boundary
  const state: CountState = town.count_state ?? { tiles: tilesForGeometry(geom, TILE_Z), next: 0, shops: [] }
  const template = await tileTemplate()
  let budget = TILES_PER_CALL
  while (state.next < state.tiles.length && budget > 0) {
    const batch = state.tiles.slice(state.next, state.next + Math.min(TILE_BATCH, budget))
    const results = await Promise.all(batch.map(([x, y]) => fetchTileFood(x, y, template)))
    for (const features of results) state.shops = mergeShops(state.shops, foodInTown(features, geom))
    state.next += batch.length
    budget -= batch.length
    if (state.next < state.tiles.length) {
      // 途中の結果を覚える（ここで止められても、次の呼び出しで続きから）
      const { error: saveError } = await db.from('towns').update({ count_state: state }).eq('town_id', town.town_id)
      if (saveError) throw new Error('towns update')
    }
  }
  if (state.next < state.tiles.length) return false
  const { error: doneError } = await db.from('towns').update({ shops: state.shops, counted_at: now, count_state: null }).eq('town_id', town.town_id)
  if (doneError) throw new Error('towns update')
  town.shops = state.shops
  town.counted_at = now
  town.count_state = null
  return true
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return fail('bad_request', 400)

  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail('unauthorized', 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth.user) return fail('unauthorized', 401)
  const userId = auth.user.id

  try {
    const nowDate = new Date()
    const now = nowDate.toISOString()
    let more = false

    // 1. 行った店
    const lastAt = await readVisits(db, userId)
    if (lastAt.size === 0) return json({ towns: [], newly: [], more: false }, 200)
    const shops = await readIn<ShopRow>(db, 'shops', 'shop_id, name, lat, lng, town_id, town_checked_at', 'shop_id', [...lastAt.keys()])

    // 2. 町を決める
    if (await assignTowns(db, shops, now)) more = true

    // 3. その人の町（boundary はここでは読まない。大きいので、数える町・新しくクリアした町だけ読む）
    const mine = new Map<string, UserShop[]>()
    for (const s of shops) {
      if (s.town_id === null) continue
      mine.set(s.town_id, [...(mine.get(s.town_id) ?? []), { id: s.shop_id, name: s.name, lat: s.lat, lng: s.lng, lastAt: lastAt.get(s.shop_id) ?? '' }])
    }
    const townRows = await readIn<TownDbRow>(db, 'towns', 'town_id, name, city_name, shops, counted_at, count_state', 'town_id', [...mine.keys()])

    // 4. 数える（初めての町を先に。数え直しは古い一覧で判定を続けながら）
    const need = townRows
      .filter((t) => t.count_state !== null || needsCount(t.counted_at, nowDate))
      .sort((a, b) => Number(a.shops !== null) - Number(b.shops !== null))
    // 1回に数えるのは1町。タイルが読めない町は飛ばして次の町を試す（1つの町が詰まっても、ほかの町が数えられるように）
    for (let n = 0; n < need.length && n < 3; n++) {
      try {
        const finished = await countTown(db, need[n], now)
        if (!finished || need.length > n + 1) more = true
        break
      } catch (e) {
        if (!(e instanceof UpstreamError)) throw e
        console.error('towns: tiles unavailable') // 途中の結果は残っている。次の機会に続きから
      }
    }

    // 5. 判定
    const { data: conquestRows, error: conquestError } = await db
      .from('town_conquests').select('town_id, conquered_at, completed_at').eq('user_id', userId)
    if (conquestError || !conquestRows) throw new Error('town_conquests read')
    const conquests = new Map<string, Conquest>()
    for (const r of conquestRows as ({ town_id: string } & Conquest)[]) conquests.set(r.town_id, { conquered_at: r.conquered_at, completed_at: r.completed_at })

    const views: TownView[] = []
    const newly: News[] = []
    for (const t of townRows) {
      const r = townView(t, mine.get(t.town_id) ?? [], conquests.get(t.town_id))
      if (r.clear || r.complete) {
        const { data, error } = await db.rpc('grant_town', {
          p_user: userId, p_town: t.town_id, p_clear: true, p_complete: r.complete, // コンプリートはクリアを含む
        })
        if (error) {
          if (error.code === '23503' && error.message.includes('profile_missing')) return fail('profile_missing', 409)
          throw new Error('grant_town')
        }
        const row = Array.isArray(data) ? data[0] : data
        if (row?.newly_cleared === true) {
          const { data: shape, error: shapeError } = await db.from('towns').select('boundary, area_m2').eq('town_id', t.town_id).single()
          if (shapeError || !shape) throw new Error('towns read')
          const s = shape as { boundary: Geometry; area_m2: number | null }
          newly.push({ id: t.town_id, name: t.name, kind: 'clear', coins: TOWN_COINS, town: { city: t.city_name, area_m2: s.area_m2, boundary: s.boundary, at: now } })
        }
        if (row?.newly_completed === true) newly.push({ id: t.town_id, name: t.name, kind: 'complete', coins: 0, town: null })
        // 同時に別の呼び出しが付けた場合も、返事には「付いている」と出す
        if (r.view.cleared_at === null) r.view.cleared_at = now
        if (r.complete && r.view.completed_at === null) r.view.completed_at = now
      }
      views.push(r.view)
    }
    return json({ towns: views, newly, more }, 200)
  } catch (e) {
    if (e instanceof UpstreamError) {
      console.error('towns upstream failed')
      return fail('upstream_error', 502)
    }
    console.error('towns failed')
    return fail('internal_error', 500)
  }
})
