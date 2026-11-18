// Supabase Edge Function（Deno）。チェックイン。
// 受け取る: POST { shop_id, lat, lng, far_from_home }（JWT 必須）。ユーザーは JWT からだけ決める。
// プライバシー: lat/lng・距離・トークン・ユーザーID・店ID をログに出さない・保存しない・返さない（403 の丸めた距離だけ返す）。
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CHECKIN_M, CLEAR_M, MATCH_M, acceptHpCheckin, activeHints, altForMapId, altHpFor, cellsAround, closestM, distanceM, jstDay, parseMapId } from './core.ts'
import type { ActiveHintRow } from './core.ts'
import { UpstreamError, verifyOsm } from './osmTile.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (error: string, status: number) => json({ error }, status)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return fail('bad_request', 400)

  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail('unauthorized', 401)

  let body: Record<string, unknown>
  try {
    const parsed = await req.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fail('bad_request', 400)
    body = parsed
  } catch {
    return fail('bad_request', 400)
  }
  const { shop_id, lat, lng, far_from_home, map_id } = body
  if (
    typeof shop_id !== 'string' || !/^(hp|osm):.{1,64}$/.test(shop_id) ||
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
    typeof far_from_home !== 'boolean'
  ) {
    return fail('bad_request', 400)
  }
  // 合体した店の、元の地図の点（任意）。あるのに形が違えば不正
  const mapId = map_id === undefined ? null : parseMapId(map_id)
  if (map_id !== undefined && mapId === null) return fail('bad_request', 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth.user) return fail('unauthorized', 401)
  const userId = auth.user.id

  try {
    // 1. 店を確かめる。アプリが言う店の場所は信じない
    let shop: { lat: number; lng: number }
    let dist: number
    let osmPoi: Awaited<ReturnType<typeof verifyOsm>> = null
    let mapPoi: Awaited<ReturnType<typeof verifyOsm>> = null // hp: のときの、合体前の地図の点（確かめた結果）
    let mapChecked = false
    if (shop_id.startsWith('hp:')) {
      const { data, error } = await db.from('shops').select('lat, lng').eq('shop_id', shop_id).maybeSingle()
      if (error) throw new Error('shops read')
      if (!data) return fail('shop_not_found', 404)
      shop = data
      // 2. 50m（GPS の誤差は足さない）。ホットペッパーの位置で足りなければ、
      //    合体前の地図の点（タイルで確かめたもの）からの距離も見て、近い方を使う
      const dHp = closestM({ lat, lng }, [shop])
      let dPoi: number | null = null
      let poiToShop: number | null = null
      if (dHp > CHECKIN_M && mapId) {
        try {
          const poi = await verifyOsm(mapId, lat, lng)
          mapChecked = true
          mapPoi = poi
          if (poi) {
            dPoi = distanceM({ lat, lng }, poi)
            poiToShop = distanceM(poi, shop) // 別の店の点で通れないように、同じ店とみなせる点だけ使う
          }
        } catch (e) {
          if (!(e instanceof UpstreamError)) throw e // タイルが読めなければ、ホットペッパーの位置の結果で決める
        }
      }
      dist = acceptHpCheckin({ dHp, dPoi, poiToShop }).distance
    } else {
      osmPoi = await verifyOsm(shop_id, lat, lng)
      if (!osmPoi) return fail('shop_not_found', 404)
      shop = osmPoi
      dist = closestM({ lat, lng }, [shop])
    }
    if (dist > CHECKIN_M) return json({ error: 'too_far', distance_m: Math.round(dist) }, 403)

    // 50m を通ってから地図の店を shops に書く（断られた要求は何も書かない）
    if (osmPoi) {
      const { error } = await db.from('shops').upsert(
        { shop_id, name: osmPoi.name, lat: osmPoi.lat, lng: osmPoi.lng, genre_name: osmPoi.subclass, fetched_at: new Date().toISOString() },
        { onConflict: 'shop_id' },
      )
      if (error) throw new Error('shops upsert')
    }

    // 気配の店の id のずれ（hp: と osm:）を確かめる（設計 2026-11-07-daily-hints §5.3）。
    // +10 を付けるかは perform_checkin が daily_hints を見て決める。ここは「同じ店の別の id」を渡すだけ
    const day = jstDay(new Date())
    const { data: hintRows, error: hintError } = await db
      .from('daily_hints')
      .select('shop_id, generation, completed_checkin_id, shops(name, lat, lng)')
      .eq('user_id', userId)
      .eq('hint_date', day)
    // 読めなければ「ずれの照合」をしないだけ（+10 は perform_checkin が自分で決める）。チェックインは止めない
    if (hintError) console.error('checkin: daily_hints read failed')
    const active = activeHints((hintError ? [] : hintRows ?? []).map((r: Record<string, unknown>): ActiveHintRow => {
      const s = (Array.isArray(r.shops) ? r.shops[0] : r.shops) as ActiveHintRow['shop'] | undefined
      return { shop_id: r.shop_id as string, generation: r.generation as number, completed_checkin_id: r.completed_checkin_id as string | null, shop: s ?? null }
    }))
    let altShopId: string | null = null
    if (shop_id.startsWith('hp:')) {
      // 気配が osm:Y（謎の気配）で、あとで hp:X と合体した店にチェックインした
      if (mapId && altForMapId(active, mapId)) {
        try {
          const poi = mapChecked ? mapPoi : await verifyOsm(mapId, lat, lng)
          if (poi && distanceM(poi, shop) <= MATCH_M) altShopId = mapId
        } catch (e) {
          if (!(e instanceof UpstreamError)) throw e // タイルが読めなければ +10 を付けないだけで、チェックインは続ける
        }
      }
    } else if (osmPoi) {
      // 気配が hp:X で、ホットペッパーの読み込みに失敗して osm:Y のままチェックインした
      altShopId = altHpFor(active, osmPoi)
    }

    // 3. 1トランザクションで書く
    const { data, error } = await db.rpc('perform_checkin', {
      p_user: userId,
      p_shop_id: shop_id,
      p_far: far_from_home,
      p_day: day,
      p_cells: cellsAround(shop.lat, shop.lng, CLEAR_M),
      p_alt_shop_id: altShopId,
    })
    if (error) {
      if (error.code === '23503' && error.message.includes('profile_missing')) return fail('profile_missing', 409)
      if (error.code === 'P0001' && error.message.includes('already_today')) return fail('already_today', 409)
      throw new Error('perform_checkin')
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('perform_checkin')
    return json({ checkin_id: row.checkin_id, coins_awarded: row.coins_awarded, new_cells: row.new_cells, was_hint: row.was_hint === true }, 200)
  } catch (e) {
    if (e instanceof UpstreamError) {
      console.error('checkin upstream failed')
      return fail('upstream_error', 502)
    }
    console.error('checkin failed')
    return fail('internal_error', 500)
  }
})
