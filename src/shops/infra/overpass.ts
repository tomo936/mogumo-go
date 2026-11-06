// 開発用の仮のお店データ元（OpenStreetMap の Overpass API）。ホットペッパー API に置き換えるまでの間だけ使う。
// 中心が自宅に近いことがあるので、何もログに出さない。
import type { LatLng } from '../../map/domain/geo.ts'
import { kindOf } from '../domain/genre.ts'
import type { Shop } from '../domain/shop.ts'
import { OVERPASS_CENTER_GRID_M, OVERPASS_RETRY_WAIT_MS, OVERPASS_URL, SHOP_RADIUS_M } from '../config.ts'
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

export function overpassQuery(center: LatLng, radiusM: number): string {
  const around = `(around:${radiusM},${center.lat},${center.lng})`
  return `[out:json][timeout:25];(
nwr[amenity~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$"]["name"]${around};
nwr[shop~"^(bakery|confectionery|pastry)$"]["name"]${around};
);out center;`
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function parseOverpass(json: unknown): Shop[] {
  if (!isObj(json) || !Array.isArray(json.elements)) return []
  const shops: Shop[] = []
  for (const el of json.elements) {
    if (!isObj(el) || !isObj(el.tags) || typeof el.tags.name !== 'string' || !el.tags.name) continue
    const pos = el.type === 'way' ? el.center : el
    if (!isObj(pos)) continue
    const lat = pos.lat
    const lng = pos.lon
    if (!isNum(lat) || !isNum(lng)) continue
    const tags = Object.fromEntries(
      Object.entries(el.tags).filter((e): e is [string, string] => typeof e[1] === 'string'),
    )
    shops.push({ id: `osm:${el.type}/${el.id}`, name: el.tags.name, lat, lng, kind: kindOf(tags, el.tags.name) })
  }
  return shops
}

async function attempt(url: string, query: string, fetchFn: typeof fetch): Promise<Shop[] | 'retry' | 'fail'> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: ctrl.signal,
    })
    if (res.status === 429 || res.status >= 500) return 'retry'
    if (!res.ok) return 'fail'
    return parseOverpass(await res.json())
  } catch {
    return 'retry' // ネットワーク失敗・タイムアウト・JSON が読めない
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchShops(
  center: LatLng,
  opts: { fetchFn?: typeof fetch; waitMs?: number } = {},
): Promise<Shop[]> {
  const fetchFn = opts.fetchFn ?? fetch
  const query = overpassQuery(roundCenter(center, OVERPASS_CENTER_GRID_M), SHOP_RADIUS_M)
  let result = await attempt(OVERPASS_URL, query, fetchFn)
  if (result === 'retry') {
    await new Promise((r) => setTimeout(r, opts.waitMs ?? OVERPASS_RETRY_WAIT_MS))
    result = await attempt(OVERPASS_URL, query, fetchFn)
  }
  if (typeof result === 'string') throw new Error('shops_unavailable')
  return result
}

export function shopSourceEnabled(dev: boolean, hostname: string): boolean {
  return dev || hostname === 'mogumo-go-dev.vercel.app'
}
