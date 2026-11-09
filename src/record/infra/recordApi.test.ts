import { describe, expect, it } from 'vitest'
import { loadRecord } from './recordApi.ts'

const query = (rows: unknown[] | null, error: unknown = null) => {
  const q = {
    order: () => q,
    range: (from: number, to: number) => Promise.resolve({ data: rows ? rows.slice(from, to + 1) : null, error }),
    in: () => Promise.resolve({ data: rows, error }),
  }
  return q
}
const client = (tables: Record<string, { rows: unknown[] | null; error?: unknown }>) => ({
  from: (t: string) => ({ select: () => query(tables[t].rows, tables[t].error ?? null) }),
})

describe('loadRecord', () => {
  it('晴れた場所（時刻つき）と、行ったお店の履歴を作る', async () => {
    const r = await loadRecord(client({
      fog_cells: { rows: [{ cell_x: 1, cell_y: 2, cleared_at: '2026-11-03T01:00:00Z' }, { cell_x: 'x', cell_y: 2, cleared_at: 'bad' }] },
      checkins: { rows: [{ shop_id: 'hp:A', checked_in_at: '2026-11-02T15:30:00Z' }, { shop_id: 'hp:Z', checked_in_at: '2026-11-03T00:00:00Z' }] },
      shops: { rows: [{ shop_id: 'hp:A', name: '麺屋A', genre_code: 'G013', photo_url: 'https://x/l.jpg' }] },
    }))
    expect(r.cells).toEqual([{ x: 1, y: 2, at: Date.parse('2026-11-03T01:00:00Z') }])
    // 名前が分からない店（hp:Z）は履歴に入れない。日付は日本時間（UTC 15:30 は翌日 11/3）
    expect(r.visits).toEqual([{ shopId: 'hp:A', name: '麺屋A', kind: 'ramen', photoUrl: 'https://x/l.jpg', day: '2026-11-03' }])
  })
  it('読めなければ throw', async () => {
    await expect(loadRecord(client({ fog_cells: { rows: null, error: { message: 'x' } }, checkins: { rows: [] }, shops: { rows: [] } }))).rejects.toThrow()
  })
})
