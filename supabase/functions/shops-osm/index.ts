// Supabase Edge Function（Deno）。晴れた場所の地図のお店（OpenStreetMap）を shops に書く。
// 受け取る: POST { tiles: [{x,y}, ...] }（ズーム 14、1〜9 枚。JWT 必須）。お店の名前・場所はアプリから受け取らず、
// ここで地図のタイルを読んで飲食店の点を取り出す（作り物のお店は入らない）。
// プライバシー: タイルの番号は保存しない・ログに出さない。書くのは公開の地図データ（shops）だけ。
// 設計: docs/superpowers/specs/2026-11-12-zukan-osm-shops-design.md
import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseTiles, rowsFromPois } from './core.ts'
import { readTilePois, UpstreamError } from './osmTile.ts'

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
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth.user) return fail('unauthorized', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('bad_request', 400)
  }
  const tiles = parseTiles(body)
  if (!tiles) return fail('bad_request', 400)

  try {
    const rows = rowsFromPois(await readTilePois(tiles), new Date().toISOString())
    if (rows.length > 0) {
      const { error } = await db.from('shops').upsert(rows, { onConflict: 'shop_id' })
      if (error) throw new Error('shops upsert')
    }
    return json({ stored: rows.length }, 200)
  } catch (e) {
    if (e instanceof UpstreamError) return fail('upstream_error', 502)
    console.error('shops-osm failed')
    return fail('server_error', 500)
  }
})
