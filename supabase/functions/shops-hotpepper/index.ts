// Supabase Edge Function（Deno）。アプリ → ここ → ホットペッパーグルメ API の中継。
// キー（HOTPEPPER_API_KEY）はここだけで読む。受け取るのは { lat, lng } だけで、250m に丸めて問い合わせる。
// 取れたお店は shops テーブルに保存（サービスロールで upsert）し、そのまま返す。
// プライバシー: 受け取った位置は保存しない・ログに出さない（console に lat/lng・キーを出さないこと）。
import { createClient } from 'npm:@supabase/supabase-js@2'
import { hotpepperUrl, parseHotpepper, roundCenter } from './core.ts'
import type { ShopRow } from './core.ts'

const PAGE = 100
const MAX_PAGES = 3
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (body: string, status: number, type = 'text/plain') =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': type } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return reply('bad_request', 400)
  let lat: unknown
  let lng: unknown
  try {
    ;({ lat, lng } = await req.json())
  } catch {
    return reply('bad_request', 400)
  }
  if (
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180
  ) {
    return reply('bad_request', 400)
  }
  const key = Deno.env.get('HOTPEPPER_API_KEY')
  if (!key) return reply('upstream_error', 502)

  const c = roundCenter(lat, lng)
  const rows: ShopRow[] = []
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetch(hotpepperUrl(key, c.lat, c.lng, page * PAGE + 1), {
        signal: AbortSignal.timeout(15000),
      })
      if (res.status === 429) return reply('rate_limited', 429)
      if (!res.ok) return reply('upstream_error', 502)
      const got = parseHotpepper(await res.json())
      rows.push(...got)
      if (got.length < PAGE) break
    }
  } catch {
    return reply('upstream_error', 502)
  }

  // 保存に失敗してもお店は返す（表示のほうが大事）
  if (rows.length > 0) {
    try {
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const fetched_at = new Date().toISOString()
      const { error } = await db
        .from('shops')
        .upsert(rows.map((r) => ({ ...r, fetched_at })), { onConflict: 'shop_id' })
      if (error) console.error('shops upsert failed')
    } catch {
      console.error('shops upsert failed')
    }
  }
  return reply(JSON.stringify(rows), 200, 'application/json')
})
