// チェーン名の一覧 src/hints/domain/chainNames.ts を作る台本。
//   node scripts/chains/build.ts [--from <フォルダ>]
// --from を付けると、<種類>.json をそのフォルダから読む（ネットに直接つながらないとき用）。
// OSM の name-suggestion-index（BSD-3-Clause）の brands/amenity/{fast_food,restaurant,cafe,ice_cream,bar,pub} のうち
// locationSet.include に jp を含むものの tags.name・tags["name:ja"]・matchNames を、正規化して集める。
import { readFileSync, writeFileSync } from 'node:fs'
import { normalizeShopName } from '../../src/hints/domain/chain.ts'

const KINDS = ['fast_food', 'restaurant', 'cafe', 'ice_cream', 'bar', 'pub']
const BASE = 'https://raw.githubusercontent.com/osmlab/name-suggestion-index/main/data/brands/amenity/'

type Item = { locationSet?: { include?: unknown[] }; tags?: Record<string, string>; matchNames?: string[] }

export function namesOf(items: readonly Item[]): string[] {
  const out: string[] = []
  for (const it of items) {
    if (!(it.locationSet?.include ?? []).some((x) => typeof x === 'string' && x.toLowerCase() === 'jp')) continue
    for (const raw of [it.tags?.name, it.tags?.['name:ja'], ...(it.matchNames ?? [])]) {
      if (typeof raw !== 'string') continue
      const n = normalizeShopName(raw)
      if (n.length >= 2) out.push(n)
    }
  }
  return out
}

const fromAt = process.argv.indexOf('--from')
const from = fromAt >= 0 ? process.argv[fromAt + 1] : null
const names = new Set<string>()
for (const k of KINDS) {
  let json: { items?: Item[] }
  if (from) {
    try {
      json = JSON.parse(readFileSync(`${from}/${k}.json`, 'utf8'))
    } catch {
      console.warn(`skip ${k}`)
      continue
    }
  } else {
    const res = await fetch(`${BASE}${k}.json`)
    if (!res.ok) {
      console.warn(`skip ${k}: ${res.status}`)
      continue
    }
    json = (await res.json()) as { items?: Item[] }
  }
  for (const n of namesOf(json.items ?? [])) names.add(n)
}
const list = [...names].sort()
const body = `// name-suggestion-index（OpenStreetMap、BSD-3-Clause）から scripts/chains/build.ts が作った。手で直さない。
// 正規化済み（normalizeShopName）・重複なし・並べ替え済み。
export const CHAIN_NAMES: readonly string[] = ${JSON.stringify(list, null, 0).replace(/","/g, '",\n  "').replace('["', '[\n  "').replace('"]', '",\n]')}
`
writeFileSync(new URL('../../src/hints/domain/chainNames.ts', import.meta.url), body)
writeFileSync(new URL('../../supabase/functions/daily-hints/chainNames.ts', import.meta.url), body) // サーバーの写し
console.log(`${list.length} names`)
