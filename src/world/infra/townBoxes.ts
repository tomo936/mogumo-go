// 行った町の四角（towns.min/max の lat/lng）。形は読まないので軽い。失敗したら throw
import type { TownsClient } from '../../towns/infra/townsApi.ts'
import type { Box } from '../domain/box.ts'

const IN_CHUNK = 100

export async function loadTownBoxes(ids: string[], client?: TownsClient): Promise<Map<string, Box>> {
  const c = client ?? ((await import('../../lib/supabase.ts')).supabase as unknown as TownsClient)
  const out = new Map<string, Box>()
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await c.from('towns').select('town_id, min_lat, max_lat, min_lng, max_lng').in('town_id', ids.slice(i, i + IN_CHUNK))
    if (error || !Array.isArray(data)) throw new Error('towns_unavailable')
    for (const r of data as Record<string, unknown>[]) {
      const { town_id: id, min_lat: minLat, max_lat: maxLat, min_lng: minLng, max_lng: maxLng } = r
      if (typeof id !== 'string') continue
      if (![minLat, maxLat, minLng, maxLng].every((v) => typeof v === 'number' && Number.isFinite(v))) continue
      out.set(id, { minLat: minLat as number, maxLat: maxLat as number, minLng: minLng as number, maxLng: maxLng as number })
    }
  }
  return out
}
