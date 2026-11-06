// Edge Function（shops-hotpepper）の純粋な部分。Deno / npm の import は置かない（Vitest から読むため）。
// 丸め方は src/shops/infra/hotpepper.ts の roundCenter と同じ。変えるときは両方そろえる。

const GRID_M = 250
const REF_LAT_DEG = 35
const M_PER_DEG_LAT = 111195
const ENDPOINT = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/'

export type ShopRow = {
  shop_id: string
  name: string
  lat: number
  lng: number
  genre_code: string | null
  genre_name: string | null
  catch: string | null
  budget_code: string | null
  budget_name: string | null
  photo_url: string | null
  open: string | null
}

// 世界に固定した 250m 四方のマスの中心に丸める
export function roundCenter(lat: number, lng: number): { lat: number; lng: number } {
  const dLat = GRID_M / M_PER_DEG_LAT
  const dLng = GRID_M / (M_PER_DEG_LAT * Math.cos((REF_LAT_DEG * Math.PI) / 180))
  const snap = (v: number, d: number) => Number(((Math.floor(v / d) + 0.5) * d).toFixed(6))
  return { lat: snap(lat, dLat), lng: snap(lng, dLng) }
}

// range=3 は半径 1km
export function hotpepperUrl(key: string, lat: number, lng: number, start: number): string {
  const q = new URLSearchParams({
    key,
    lat: String(lat),
    lng: String(lng),
    range: '3',
    count: '100',
    start: String(start),
    format: 'json',
  })
  return `${ENDPOINT}?${q.toString()}`
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export function parseHotpepper(json: unknown): ShopRow[] {
  if (!isObj(json) || !isObj(json.results) || !Array.isArray(json.results.shop)) return []
  const rows: ShopRow[] = []
  for (const s of json.results.shop) {
    if (!isObj(s)) continue
    const id = str(s.id)
    const name = str(s.name)
    const lat = Number(s.lat)
    const lng = Number(s.lng)
    if (!id || !name || s.lat == null || s.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const genre = isObj(s.genre) ? s.genre : {}
    const budget = isObj(s.budget) ? s.budget : {}
    const photo = isObj(s.photo) && isObj(s.photo.mobile) ? s.photo.mobile : {}
    rows.push({
      shop_id: `hp:${id}`,
      name,
      lat,
      lng,
      genre_code: str(genre.code),
      genre_name: str(genre.name),
      catch: str(s.catch),
      budget_code: str(budget.code),
      budget_name: str(budget.name),
      photo_url: str(photo.l),
      open: str(s.open),
    })
  }
  return rows
}

// ホットペッパーは鍵や引数の誤りを HTTP 200 の { results: { error: [...] } } で返す
export function hotpepperError(json: unknown): boolean {
  return isObj(json) && isObj(json.results) && json.results.error != null
}

// 名前なしを捨てる前の件数。ページの最後かどうかはこちらで決める
export function rawShopCount(json: unknown): number {
  return isObj(json) && isObj(json.results) && Array.isArray(json.results.shop) ? json.results.shop.length : 0
}

// 同じ shop_id が重なると upsert が失敗するので、最初の1件だけ残す
export function dedupeRows(rows: ShopRow[]): ShopRow[] {
  const seen = new Set<string>()
  return rows.filter((r) => (seen.has(r.shop_id) ? false : (seen.add(r.shop_id), true)))
}
