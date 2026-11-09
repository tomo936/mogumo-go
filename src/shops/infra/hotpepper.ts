// ホットペッパーのお店を Edge Function（shops-hotpepper）経由で取る。
// 中心が自宅に近いことがあるので、何もログに出さない。
import type { LatLng } from '../../map/domain/geo.ts'
import { kindFromHotpepper } from '../domain/kind.ts'
import type { Shop } from '../domain/shop.ts'
import { SHOP_CENTER_GRID_M, SHOP_RETRY_WAIT_MS } from '../config.ts'
import { REF_LAT_DEG } from '../../fog/config.ts'
import { M_PER_DEG_LAT } from '../../fog/domain/grid.ts'

const TIMEOUT_MS = 25000

// 世界に固定した gridM 四方のマスの中心に丸める（正確な現在地を外に送らないため）。
// 経度の幅はセルと同じく北緯35度で決める。ずれは最大で半マスの対角（250m なら約177m）
export function roundCenter(p: LatLng, gridM: number): LatLng {
  const dLat = gridM / M_PER_DEG_LAT
  const dLng = gridM / (M_PER_DEG_LAT * Math.cos((REF_LAT_DEG * Math.PI) / 180))
  const snap = (v: number, d: number) => Number(((Math.floor(v / d) + 0.5) * d).toFixed(6))
  return { lat: snap(p.lat, dLat), lng: snap(p.lng, dLng) }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const httpsOrNull = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('https://') ? v : null)

// Edge Function が返す行（supabase/functions/shops-hotpepper/core.ts の ShopRow）を Shop に直す
function toShops(json: unknown): Shop[] {
  if (!Array.isArray(json)) throw new Error('bad_json') // 読めない形はやり直し対象にする
  const shops: Shop[] = []
  for (const r of json) {
    if (!isObj(r) || typeof r.shop_id !== 'string' || typeof r.name !== 'string' || !isNum(r.lat) || !isNum(r.lng)) continue
    const genreCode = strOrNull(r.genre_code)
    shops.push({
      id: r.shop_id,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      kind: kindFromHotpepper(genreCode, r.name),
      details: {
        genreCode,
        genreName: strOrNull(r.genre_name),
        catch: strOrNull(r.catch),
        budgetName: strOrNull(r.budget_name),
        photoUrl: httpsOrNull(r.photo_url),
        open: strOrNull(r.open),
      },
      mapId: null,
    })
  }
  return shops
}

type Req = { endpoint: string; headers: Record<string, string>; body: string }

async function attempt(req: Req, fetchFn: typeof fetch): Promise<Shop[] | 'retry' | 'fail'> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetchFn(req.endpoint, { method: 'POST', headers: req.headers, body: req.body, signal: ctrl.signal })
    if (res.status === 429 || res.status >= 500) return 'retry'
    if (!res.ok) return 'fail'
    return toShops(await res.json())
  } catch {
    return 'retry' // ネットワーク失敗・タイムアウト・JSON が読めない
  } finally {
    clearTimeout(timer)
  }
}

// supabase は読み込み時に環境変数を要求するので、使う時に読む（テストで env 無しでも import できる）
const sessionToken = async () =>
  (await (await import('../../lib/supabase.ts')).supabase.auth.getSession()).data.session?.access_token ?? null

// Edge Function（shops-hotpepper）経由で取る。送るのは 250m に丸めた中心だけ
export async function fetchHotpepperShops(
  center: LatLng,
  opts: {
    fetchFn?: typeof fetch
    waitMs?: number
    endpoint?: string
    anonKey?: string
    getToken?: () => Promise<string | null>
  } = {},
): Promise<Shop[]> {
  const fetchFn = opts.fetchFn ?? fetch
  const token = await (opts.getToken ?? sessionToken)()
  if (!token) throw new Error('shops_unavailable')
  const c = roundCenter(center, SHOP_CENTER_GRID_M)
  const req: Req = {
    endpoint: opts.endpoint ?? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shops-hotpepper`,
    headers: {
      'Content-Type': 'application/json',
      apikey: opts.anonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lat: c.lat, lng: c.lng }),
  }
  let result = await attempt(req, fetchFn)
  if (result === 'retry') {
    await new Promise((r) => setTimeout(r, opts.waitMs ?? SHOP_RETRY_WAIT_MS))
    result = await attempt(req, fetchFn)
  }
  if (typeof result === 'string') throw new Error('shops_unavailable')
  return result
}

export function shopSourceEnabled(dev: boolean, hostname: string): boolean {
  return dev || hostname === 'mogumo-go-dev.vercel.app'
}
