// 図鑑のデータ: 見つけたお店（shops。RLS で誰でも読める）と、自分の記録（loadProgress）を合わせる。
// shops はみんなの分が増え続けるので、晴れたマスのまわりの四角と、行ったお店の id だけを読む（2026-11-13）。
import { kindFromHotpepper, kindFromMap } from '../../shops/domain/kind.ts'
import { areaBoxes, boxFilter, nearbyTwins } from '../domain/area.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { cellKey, cellOf } from '../../fog/domain/grid.ts'
import { loadProgress } from '../../checkin/infra/checkinApi.ts'
import type { ZukanShop } from '../domain/zukan.ts'

type Rows = PromiseLike<{ data: unknown; error: unknown }>
type Query = { or(filter: string): Query; in(column: string, values: string[]): Query; order(c: string): Query; range(from: number, to: number): Rows }
type ShopsClient = { from(table: string): { select(columns: string): Query } }
const PAGE = 1000
const BOXES_PER_QUERY = 20 // URL が長くなりすぎないように
const IDS_PER_QUERY = 100

const COLUMNS = 'shop_id, name, lat, lng, genre_code, genre_name, catch, budget_name, photo_url'

// 1 つの絞り込みで、1000 行ずつ足りなくなるまで読む（並びを固定して頁の抜け・重なりを防ぐ）
async function readPaged(c: ShopsClient, filter: (q: Query) => Query): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(c.from('shops').select(COLUMNS)).order('shop_id').range(from, from + PAGE - 1)
    if (error || !Array.isArray(data)) throw new Error('zukan_unavailable')
    out.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) return out
  }
}

const chunks = <T,>(xs: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

// 晴れたマスのまわりの四角と、行ったお店（霧の中でも出す）の id だけ。同じ行は 1 つに
async function readShops(c: ShopsClient, cleared: ReadonlySet<string>, visitedIds: readonly string[]): Promise<Record<string, unknown>[]> {
  const parts = await Promise.all([
    ...chunks(areaBoxes(cleared), BOXES_PER_QUERY).map((boxes) => readPaged(c, (q) => q.or(boxFilter(boxes)))),
    ...chunks(visitedIds, IDS_PER_QUERY).map((ids) => readPaged(c, (q) => q.in('shop_id', ids))),
  ])
  const byId = new Map<string, Record<string, unknown>>()
  for (const r of parts.flat()) if (typeof r.shop_id === 'string') byId.set(r.shop_id, r)
  return [...byId.values()]
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

// 地図のお店（osm:）をホットペッパーのお店にまとめる組（hp: → osm:）。地図の画面と同じ決め方（mergeShops）
function twins(shops: readonly ZukanShop[], mapShops: readonly Shop[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of mapShops) if (m.id.startsWith('hp:') && m.mapId) out.set(m.id, m.mapId) // 地図の画面でまとめ済みの組
  const lite = (s: ZukanShop): Shop => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, kind: s.kind, details: null, mapId: null })
  const paired = new Set(out.values())
  const osm = shops.filter((s) => s.id.startsWith('osm:') && !paired.has(s.id)).map(lite)
  const hp = shops.filter((s) => s.id.startsWith('hp:') && !out.has(s.id)).map(lite)
  for (const [h, o] of nearbyTwins(osm, hp)) out.set(h, o) // 近くの店どうしだけで比べる（総当たりにしない）
  return out
}

// opts.mapShops: 今の地図のお店（shops に書く前でもすぐ「？」を出す）。opts.cleared: 地図の晴れたマス（自宅のまわり・町のクリアも入る）
export async function loadZukan(client?: ShopsClient, opts: { mapShops?: readonly Shop[]; cleared?: ReadonlySet<string> } = {}): Promise<ZukanShop[]> {
  const c = client ?? ((await import('../../lib/supabase.ts')).supabase as unknown as ShopsClient)
  const progress = await loadProgress()
  const cleared = new Set([...progress.cells.map((c) => cellKey(c)), ...(opts.cleared ?? [])])
  const rows = await readShops(c, cleared, [...progress.visitsByShop.keys()])
  const shops: ZukanShop[] = []
  for (const r of rows) {
    const id = str(r.shop_id)
    const name = str(r.name)
    if (!id || !name || typeof r.lat !== 'number' || typeof r.lng !== 'number') continue
    shops.push({
      id,
      name,
      lat: r.lat,
      lng: r.lng,
      // 地図のお店は地図の画面と同じ決め方（genre_name に地図の分類が入っている）
      kind: id.startsWith('osm:') ? kindFromMap(str(r.genre_name) ?? '', name) : kindFromHotpepper(str(r.genre_code), name),
      photoUrl: str(r.photo_url)?.startsWith('https://') ? str(r.photo_url) : null,
      catch: str(r.catch),
      genreName: str(r.genre_name),
      budgetName: str(r.budget_name),
      visits: progress.visitsByShop.get(id) ?? null,
      cleared: cleared.has(cellKey(cellOf({ lat: r.lat, lng: r.lng }))),
    })
  }
  const known = new Set(shops.map((s) => s.id))
  for (const m of opts.mapShops ?? []) {
    if (!m.id.startsWith('osm:') || known.has(m.id)) continue
    known.add(m.id)
    shops.push({
      id: m.id, name: m.name, lat: m.lat, lng: m.lng, kind: m.kind, photoUrl: null, catch: null, genreName: null, budgetName: null,
      visits: progress.visitsByShop.get(m.id) ?? null,
      cleared: cleared.has(cellKey(cellOf(m))),
    })
  }
  const pairs = twins(shops, opts.mapShops ?? [])
  return shops.map((s) => (pairs.has(s.id) ? { ...s, mapId: pairs.get(s.id) } : s))
}
