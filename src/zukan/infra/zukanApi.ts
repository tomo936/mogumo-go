// 図鑑のデータ: 見つけたお店（shops。RLS で誰でも読める）と、自分の記録（loadProgress）を合わせる。
import { kindFromHotpepper } from '../../shops/domain/kind.ts'
import { loadProgress } from '../../checkin/infra/checkinApi.ts'
import type { ZukanShop } from '../domain/zukan.ts'

type Rows = PromiseLike<{ data: unknown; error: unknown }>
type ShopsClient = { from(table: string): { select(columns: string): { order(c: string): { range(from: number, to: number): Rows } } } }
const PAGE = 1000

const COLUMNS = 'shop_id, name, lat, lng, genre_code, genre_name, catch, photo_url'

// 1000 行ずつ、足りなくなるまで読む（並びを固定して頁の抜け・重なりを防ぐ）
async function readShops(c: ShopsClient): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c.from('shops').select(COLUMNS).order('shop_id').range(from, from + PAGE - 1)
    if (error || !Array.isArray(data)) throw new Error('zukan_unavailable')
    out.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) return out
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export async function loadZukan(client?: ShopsClient): Promise<ZukanShop[]> {
  const c = client ?? ((await import('../../lib/supabase.ts')).supabase as unknown as ShopsClient)
  const [rows, progress] = await Promise.all([readShops(c), loadProgress()])
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
      kind: kindFromHotpepper(str(r.genre_code), name),
      photoUrl: str(r.photo_url)?.startsWith('https://') ? str(r.photo_url) : null,
      catch: str(r.catch),
      genreName: str(r.genre_name),
      visits: progress.visitsByShop.get(id) ?? null,
    })
  }
  return shops
}
