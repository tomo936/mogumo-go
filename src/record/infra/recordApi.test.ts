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
      checkins: { rows: [{ checkin_id: 'c1', shop_id: 'hp:A', checked_in_at: '2026-11-02T15:30:00Z', was_hint: true }, { checkin_id: 'c2', shop_id: 'hp:Z', checked_in_at: '2026-11-03T00:00:00Z', was_hint: false }] },
      shops: { rows: [{ shop_id: 'hp:A', name: '麺屋A', genre_code: 'G013', photo_url: 'https://x/l.jpg', lat: 35.6, lng: 139.6 }] },
      daily_hints: { rows: [{ completed_checkin_id: 'c1', is_mystery: true }, { completed_checkin_id: null, is_mystery: true }] },
    }))
    expect(r.cells).toEqual([{ x: 1, y: 2, at: Date.parse('2026-11-03T01:00:00Z') }])
    // 名前が分からない店（hp:Z）は履歴に入れない。日付は日本時間（UTC 15:30 は翌日 11/3）
    expect(r.visits).toEqual([{
      shopId: 'hp:A', name: '麺屋A', kind: 'ramen', photoUrl: 'https://x/l.jpg', day: '2026-11-03',
      at: Date.parse('2026-11-02T15:30:00Z'), lat: 35.6, lng: 139.6, wasHint: true, mysteryHint: true,
    }])
  })
  it('位置の無いお店は lat・lng が null、気配の表が読めなくても履歴は出る', async () => {
    const r = await loadRecord(client({
      fog_cells: { rows: [] },
      checkins: { rows: [{ checkin_id: 'c1', shop_id: 'hp:A', checked_in_at: '2026-11-02T03:00:00Z', was_hint: false }] },
      shops: { rows: [{ shop_id: 'hp:A', name: '麺屋A', genre_code: null, photo_url: null }] },
      daily_hints: { rows: null, error: { message: 'x' } },
    }))
    expect(r.visits[0]).toMatchObject({ lat: null, lng: null, wasHint: false, mysteryHint: false })
  })
  it('読めなければ throw', async () => {
    await expect(loadRecord(client({ fog_cells: { rows: null, error: { message: 'x' } }, checkins: { rows: [] }, shops: { rows: [] }, daily_hints: { rows: [] } }))).rejects.toThrow()
  })
})
