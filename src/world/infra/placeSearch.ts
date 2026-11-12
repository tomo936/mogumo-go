// 国土地理院の住所検索。外へ送るのは打った言葉だけ
import { parsePlaces } from '../domain/gsi.ts'
import type { Place } from '../domain/gsi.ts'

const URL_BASE = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q='

export async function searchPlaces(q: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<Place[]> {
  const word = q.trim()
  if (word.length < 2) return []
  const res = await fetcher(URL_BASE + encodeURIComponent(word), { signal })
  if (!res.ok) throw new Error('search_failed')
  return parsePlaces(await res.json(), 8)
}
