import { describe, expect, it, vi } from 'vitest'

vi.mock('./photo.ts', () => ({ compressPhoto: async () => new Blob(['x'], { type: 'image/jpeg' }) }))

import { deleteReview, loadMine, loadOthers, loadSummary, photoUrls, reportReview, saveReview } from './reviewsApi.ts'
import type { Review } from '../domain/review.ts'
import type { ReviewsClient } from './reviewsApi.ts'

type Op = [string, unknown[]]
type Res = { data: unknown; error: unknown }

// 呼ばれた順を log に残す偽の client
function fake(respond: (table: string, ops: Op[]) => Res, storage: Partial<Record<'upload' | 'remove' | 'sign', (...a: unknown[]) => Res>> = {}) {
  const log: string[] = []
  const tables: { table: string; ops: Op[] }[] = []
  const builder = (table: string) => {
    const ops: Op[] = []
    tables.push({ table, ops })
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'in', 'order', 'range', 'limit', 'insert', 'update', 'delete', 'single']) {
      b[m] = (...args: unknown[]) => { ops.push([m, args]); if (m === 'insert' || m === 'update' || m === 'delete') log.push(`${table}.${m}`); return b }
    }
    b.then = (ok: (r: Res) => unknown, ng: (e: unknown) => unknown) => Promise.resolve(respond(table, ops)).then(ok, ng)
    return b
  }
  const client = {
    from: builder,
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' } } } }) },
    storage: {
      from: () => ({
        upload: async (...a: unknown[]) => { log.push(`upload:${String(a[0])}`); return storage.upload?.(...a) ?? { data: null, error: null } },
        remove: async (...a: unknown[]) => { log.push(`remove:${String((a[0] as string[])[0])}`); return storage.remove?.(...a) ?? { data: null, error: null } },
        createSignedUrls: async (...a: unknown[]) => { log.push('sign'); return storage.sign?.(...a) ?? { data: [], error: null } },
      }),
    },
  }
  return { client: client as unknown as ReviewsClient, log, tables }
}

const row = (id: string, user: string, extra: Record<string, unknown> = {}) => ({
  review_id: id, checkin_id: `c-${id}`, shop_id: 'hp:A', user_id: user, stars: 4, body: 'うまい', photo_path: null, is_public: true, created_at: '2026-11-03T03:00:00Z', ...extra,
})

const mine = (extra: Partial<Review> = {}): Review => ({
  id: 'r1', checkinId: 'c1', shopId: 'hp:A', userId: 'me', stars: 3, body: null, photoPath: 'me/old.jpg', isPublic: true, createdAt: '2026-11-03T03:00:00Z', nickname: null, ...extra,
})

describe('loadOthers', () => {
  it('自分を除き、11 件返れば hasMore で 10 件、ニックネームを合わせる', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => row(`r${i}`, `u${i}`))
    const { client, tables } = fake((t) => (t === 'reviews' ? { data: rows, error: null } : { data: [{ user_id: 'u0', nickname: 'もぐ' }], error: null }))
    const res = await loadOthers('hp:A', 0, client)
    expect(res.hasMore).toBe(true)
    expect(res.items).toHaveLength(10)
    expect(res.items[0].nickname).toBe('もぐ')
    const ops = tables[0].ops
    expect(ops).toContainEqual(['neq', ['user_id', 'me']])
    expect(ops).toContainEqual(['range', [0, 10]])
  })
  it('壊れた行・自分の行・非公開の行は捨てる', async () => {
    const { client } = fake((t) => (t === 'reviews'
      ? { data: [row('a', 'u1', { stars: '5' }), row('b', 'me'), row('c', 'u2', { is_public: false }), row('d', 'u3')], error: null }
      : { data: [], error: null }))
    const res = await loadOthers('hp:A', 0, client)
    expect(res.items.map((r) => r.id)).toEqual(['d'])
    expect(res.hasMore).toBe(false)
  })
})

describe('loadSummary', () => {
  it('返ってきた他人の星だけで平均', async () => {
    const { client } = fake(() => ({ data: [{ stars: 5, user_id: 'u1' }, { stars: 4, user_id: 'u2' }, { stars: 4, user_id: 'u3' }, { stars: 1, user_id: 'me' }], error: null }))
    expect(await loadSummary('hp:A', client)).toEqual({ avg: 4.3, count: 3 })
  })
})

describe('loadMine', () => {
  it('訪問と自分の感想を読む', async () => {
    const { client } = fake((t) => (t === 'checkins'
      ? { data: [{ checkin_id: 'c1', checked_in_at: '2026-11-03T03:00:00Z' }, { checkin_id: 5 }], error: null }
      : { data: [row('r1', 'me', { checkin_id: 'c1', is_public: false })], error: null }))
    const res = await loadMine('hp:A', client)
    expect(res.visits).toEqual([{ checkinId: 'c1', checkedInAt: '2026-11-03T03:00:00Z' }])
    expect(res.mine[0]).toMatchObject({ id: 'r1', isPublic: false })
  })
})

describe('saveReview', () => {
  it('新しい写真: 上げる → insert → 古い写真を消す', async () => {
    const { client, log } = fake(() => ({ data: row('r1', 'me', { photo_path: 'me/new.jpg' }), error: null }))
    const r = await saveReview({ shopId: 'hp:A', checkinId: 'c1', existing: mine(), stars: 4, body: null, isPublic: true, photo: { kind: 'new', file: new Blob(['y']) } }, client)
    expect(log[0]).toMatch(/^upload:me\/.+\.jpg$/)
    expect(log[1]).toBe('reviews.update')
    expect(log[2]).toBe('remove:me/old.jpg')
    expect(r.id).toBe('r1')
  })
  it('insert に失敗したら上げた写真を消して throw', async () => {
    const { client, log } = fake(() => ({ data: null, error: { code: '42501' } }))
    await expect(saveReview({ shopId: 'hp:A', checkinId: 'c1', existing: null, stars: 4, body: null, isPublic: true, photo: { kind: 'new', file: new Blob(['y']) } }, client)).rejects.toThrow()
    expect(log[1]).toBe('reviews.insert')
    expect(log[2]).toBe(log[0].replace('upload:', 'remove:'))
  })
  it('古い写真を消すのに失敗しても成功', async () => {
    const { client } = fake(() => ({ data: row('r1', 'me'), error: null }), { remove: () => { throw new Error('x') } })
    const r = await saveReview({ shopId: 'hp:A', checkinId: 'c1', existing: mine(), stars: 4, body: null, isPublic: true, photo: { kind: 'remove' } }, client)
    expect(r.photoPath).toBeNull()
  })
  it('keep なら photo_path を送らず、写真に触らない', async () => {
    const { client, log, tables } = fake(() => ({ data: row('r1', 'me', { photo_path: 'me/old.jpg' }), error: null }))
    await saveReview({ shopId: 'hp:A', checkinId: 'c1', existing: mine(), stars: 2, body: 'x', isPublic: false, photo: { kind: 'keep' } }, client)
    expect(log).toEqual(['reviews.update'])
    expect(tables[0].ops.find((o) => o[0] === 'update')?.[1][0]).toEqual({ stars: 2, body: 'x', is_public: false })
  })
})

describe('deleteReview', () => {
  it('行を消してから写真を消す', async () => {
    const { client, log } = fake(() => ({ data: null, error: null }))
    await deleteReview(mine(), client)
    expect(log).toEqual(['reviews.delete', 'remove:me/old.jpg'])
  })
})

describe('reportReview', () => {
  it('23505 は already', async () => {
    expect(await reportReview('r1', fake(() => ({ data: null, error: { code: '23505' } })).client)).toBe('already')
    expect(await reportReview('r1', fake(() => ({ data: null, error: null })).client)).toBe('ok')
    await expect(reportReview('r1', fake(() => ({ data: null, error: { code: '42501' } })).client)).rejects.toThrow()
  })
})

describe('photoUrls', () => {
  it('空なら呼ばない', async () => {
    const { client, log } = fake(() => ({ data: null, error: null }))
    expect((await photoUrls([], client)).size).toBe(0)
    expect(log).toEqual([])
  })
  it('path ごとの URL', async () => {
    const { client } = fake(() => ({ data: null, error: null }), { sign: () => ({ data: [{ path: 'u/a.jpg', signedUrl: 'https://s/a' }, { path: 'u/b.jpg', signedUrl: null }], error: null }) })
    const m = await photoUrls(['u/a.jpg', 'u/b.jpg'], client)
    expect(m.get('u/a.jpg')).toBe('https://s/a')
    expect(m.has('u/b.jpg')).toBe(false)
  })
})
