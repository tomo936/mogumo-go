// Supabase Edge Function（Deno）。チェックイン。
// 受け取る: POST { shop_id, lat, lng, far_from_home }（JWT 必須）。ユーザーは JWT からだけ決める。
// プライバシー: lat/lng・距離・トークン・ユーザーID・店ID をログに出さない・保存しない・返さない（403 の丸めた距離だけ返す）。
import { createClient } from 'npm:@supabase/supabase-js@2'
import { VectorTile } from 'npm:@mapbox/vector-tile@2'
import Pbf from 'npm:pbf@4'
import { CHECKIN_M, CLEAR_M, cellsAround, distanceM, findPoi, jstDay, tilesToTry } from './core.ts'
import type { PoiFeature } from './core.ts'

const Z = 14
const EDGE_M = 60
const TILEJSON = 'https://tiles.openfreemap.org/planet'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (error: string, status: number) => json({ error }, status)

class UpstreamError extends Error {}

async function fetchTilePois(x: number, y: number, template: string): Promise<PoiFeature[]> {
  const url = template.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y))
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (res.status === 404 || res.status === 204) return []
  if (!res.ok) throw new UpstreamError('tile')
  const tile = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())))
  const layer = tile.layers['poi']
  if (!layer) return []
  const out: PoiFeature[] = []
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i)
    const g = f.toGeoJSON(x, y, Z).geometry
    if (g.type !== 'Point') continue
    const [lng, lat] = g.coordinates as number[]
    out.push({
      id: f.id,
      name: typeof f.properties.name === 'string' ? f.properties.name : undefined,
      subclass: typeof f.properties.subclass === 'string' ? f.properties.subclass : undefined,
      lng,
      lat,
    })
  }
  return out
}

// 現在地のタイル（端に近ければ隣も）から、アプリが言う番号の点を探す
async function verifyOsm(shopId: string, lat: number, lng: number) {
  const meta = await fetch(TILEJSON, { signal: AbortSignal.timeout(15000) })
  if (!meta.ok) throw new UpstreamError('tilejson')
  const template = (await meta.json()).tiles?.[0]
  if (typeof template !== 'string') throw new UpstreamError('tilejson')
  for (const t of tilesToTry(lat, lng, Z, EDGE_M)) {
    const poi = findPoi(await fetchTilePois(t.x, t.y, template), shopId)
    if (poi) return poi
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return fail('bad_request', 400)

  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return fail('unauthorized', 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('bad_request', 400)
  }
  const { shop_id, lat, lng, far_from_home } = body
  if (
    typeof shop_id !== 'string' || !/^(hp|osm):.{1,64}$/.test(shop_id) ||
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
    typeof far_from_home !== 'boolean'
  ) {
    return fail('bad_request', 400)
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth.user) return fail('unauthorized', 401)
  const userId = auth.user.id

  try {
    // 1. 店を確かめる。アプリが言う店の場所は信じない
    let shop: { lat: number; lng: number }
    if (shop_id.startsWith('hp:')) {
      const { data, error } = await db.from('shops').select('lat, lng').eq('shop_id', shop_id).maybeSingle()
      if (error) throw new Error('shops read')
      if (!data) return fail('shop_not_found', 404)
      shop = data
    } else {
      const poi = await verifyOsm(shop_id, lat, lng)
      if (!poi) return fail('shop_not_found', 404)
      const { error } = await db.from('shops').upsert(
        { shop_id, name: poi.name, lat: poi.lat, lng: poi.lng, genre_name: poi.subclass, fetched_at: new Date().toISOString() },
        { onConflict: 'shop_id' },
      )
      if (error) throw new Error('shops upsert')
      shop = poi
    }

    // 2. 50m（GPS の誤差は足さない）
    const dist = distanceM({ lat, lng }, shop)
    if (dist > CHECKIN_M) return json({ error: 'too_far', distance_m: Math.round(dist) }, 403)

    // 3. 1トランザクションで書く
    const { data, error } = await db.rpc('perform_checkin', {
      p_user: userId,
      p_shop_id: shop_id,
      p_far: far_from_home,
      p_day: jstDay(new Date()),
      p_cells: cellsAround(shop.lat, shop.lng, CLEAR_M),
    })
    if (error) {
      if (error.code === '23503') return fail('profile_missing', 409)
      throw new Error('perform_checkin')
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('perform_checkin')
    return json({ checkin_id: row.checkin_id, coins_awarded: row.coins_awarded, new_cells: row.new_cells }, 200)
  } catch (e) {
    if (e instanceof UpstreamError) {
      console.error('checkin upstream failed')
      return fail('upstream_error', 502)
    }
    console.error('checkin failed')
    return fail('internal_error', 500)
  }
})
