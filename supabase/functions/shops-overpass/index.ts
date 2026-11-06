// Supabase Edge Function（Deno）。アプリ → ここ → overpass-api.de の中継。
// overpass-api.de は送り主を名乗らない通信を 406 で断るため、User-Agent を付けてここから問い合わせる。
// 受け取るのは { lat, lng } だけ。問い合わせ文はここで組み立てる（任意の問い合わせは中継しない）。範囲は 1km 固定。
// プライバシー: 受け取った位置は保存しない・ログに出さない（console に lat/lng を出さないこと）。
// 丸め方と問い合わせ文は src/shops/infra/overpass.ts（roundCenter / overpassQuery）と同じ。変えるときは両方そろえる。

const GRID_M = 250
const RADIUS_M = 1000
const REF_LAT_DEG = 35
const M_PER_DEG_LAT = 111195
const UA = 'mogumo-go/0.1 (+https://github.com/tomo936/mogumo-go)'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (body: string, status: number, type = 'text/plain') =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': type } })

function round(lat: number, lng: number) {
  const dLat = GRID_M / M_PER_DEG_LAT
  const dLng = GRID_M / (M_PER_DEG_LAT * Math.cos((REF_LAT_DEG * Math.PI) / 180))
  const snap = (v: number, d: number) => Number(((Math.floor(v / d) + 0.5) * d).toFixed(6))
  return { lat: snap(lat, dLat), lng: snap(lng, dLng) }
}

function query(c: { lat: number; lng: number }): string {
  const around = `(around:${RADIUS_M},${c.lat},${c.lng})`
  return `[out:json][timeout:25];(
nwr[amenity~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$"]["name"]${around};
nwr[shop~"^(bakery|confectionery|pastry)$"]["name"]${around};
);out center;`
}

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
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: `data=${encodeURIComponent(query(round(lat, lng)))}`,
      signal: AbortSignal.timeout(25000),
    })
    if (res.status === 429) return reply('rate_limited', 429)
    if (!res.ok) return reply('upstream_error', 502)
    return reply(await res.text(), 200, 'application/json')
  } catch {
    return reply('upstream_error', 502)
  }
})
