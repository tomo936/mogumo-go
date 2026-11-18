// 国土地理院の住所検索の返事を読む。壊れた返事でも落とさない。純粋な計算。
export type Place = { title: string; lat: number; lng: number }

export function parsePlaces(json: unknown, limit: number): Place[] {
  if (!Array.isArray(json)) return []
  const out: Place[] = []
  for (const item of json) {
    if (out.length >= limit) break
    const it = item as { geometry?: { coordinates?: unknown }; properties?: { title?: unknown } } | null
    const c = it?.geometry?.coordinates
    const title = it?.properties?.title
    if (!Array.isArray(c) || typeof title !== 'string' || title === '') continue
    const [lng, lat] = c
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) continue
    out.push({ title, lat, lng })
  }
  return out
}
