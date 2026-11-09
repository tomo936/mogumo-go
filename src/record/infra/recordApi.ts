// 記録のデータ: 晴れた場所（fog_cells。いつ晴れたか付き）と、行ったお店の履歴（checkins ＋ shops の名前）。
// 自分の行だけが返る（RLS）。失敗したら throw して、画面が「読み込めませんでした」を出す。
import { kindFromHotpepper } from '../../shops/domain/kind.ts'
import { jstDay } from '../../checkin/domain/day.ts'
import type { ClearedCell, VisitEntry } from '../domain/timeline.ts'

type Rows = PromiseLike<{ data: unknown; error: unknown }>
type Query = { order(c: string): Query; range(from: number, to: number): Rows }
type Client = {
  from(table: string): {
    select(columns: string): Query & { in(column: string, values: string[]): Rows }
  }
}
const PAGE = 1000
const IN_CHUNK = 100

async function readAll(c: Client, table: string, columns: string, order: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    let q: Query = c.from(table).select(columns)
    for (const o of order) q = q.order(o)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error || !Array.isArray(data)) throw new Error('record_unavailable')
    out.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) return out
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export async function loadRecord(client?: Client): Promise<{ cells: ClearedCell[]; visits: VisitEntry[] }> {
  const c = client ?? ((await import('../../lib/supabase.ts')).supabase as unknown as Client)
  const [cellRows, checkinRows] = await Promise.all([
    readAll(c, 'fog_cells', 'cell_x, cell_y, cleared_at', ['cell_x', 'cell_y']),
    readAll(c, 'checkins', 'shop_id, checked_in_at', ['checked_in_at', 'shop_id']),
  ])
  const cells: ClearedCell[] = []
  for (const r of cellRows) {
    const at = typeof r.cleared_at === 'string' ? Date.parse(r.cleared_at) : NaN
    if (typeof r.cell_x === 'number' && typeof r.cell_y === 'number' && Number.isFinite(at)) cells.push({ x: r.cell_x, y: r.cell_y, at })
  }
  // 行ったお店の名前など
  const ids = [...new Set(checkinRows.map((r) => str(r.shop_id)).filter((x): x is string => x !== null))]
  const names = new Map<string, { name: string; code: string | null; photo: string | null }>()
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await c.from('shops').select('shop_id, name, genre_code, photo_url').in('shop_id', ids.slice(i, i + IN_CHUNK))
    if (error || !Array.isArray(data)) throw new Error('record_unavailable')
    for (const r of data as Record<string, unknown>[]) {
      const id = str(r.shop_id)
      const name = str(r.name)
      if (id && name) names.set(id, { name, code: str(r.genre_code), photo: str(r.photo_url) })
    }
  }
  const visits: VisitEntry[] = []
  for (const r of checkinRows) {
    const id = str(r.shop_id)
    const at = typeof r.checked_in_at === 'string' ? new Date(r.checked_in_at) : null
    const info = id ? names.get(id) : undefined
    if (!id || !at || Number.isNaN(at.getTime()) || !info) continue
    const photo = info.photo?.startsWith('https://') ? info.photo : null
    visits.push({ shopId: id, name: info.name, kind: kindFromHotpepper(info.code, info.name), photoUrl: photo, day: jstDay(at) })
  }
  return { cells, visits }
}
