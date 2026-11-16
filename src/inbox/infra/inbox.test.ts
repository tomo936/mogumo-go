import { beforeEach, expect, test, vi } from 'vitest'
import { claimPresent, loadInbox } from './inboxApi.ts'
import { loadRead, markRead } from './readState.ts'

const rpcBy = (byFn: Record<string, { data: unknown; error?: unknown }>) => ({
  rpc: vi.fn((fn: string) => Promise.resolve({ data: byFn[fn]?.data ?? null, error: byFn[fn]?.error ?? null })),
})

test('お知らせとプレゼントを一緒に読む', async () => {
  const c = rpcBy({
    my_notices: { data: [{ notice_id: 1, title: 'a', body: 'b', starts_at: '2026-11-17T00:00:00Z' }] },
    my_presents: { data: [{ present_id: 2, title: 'p', message: '', coins: 50, expires_at: '2026-11-20T00:00:00Z', claimed: false }] },
  })
  const r = await loadInbox(c)
  expect(r.notices.map((n) => n.id)).toEqual([1])
  expect(r.presents.map((p) => p.id)).toEqual([2])
})

test('読めないときは空（アプリは止まらない）', async () => {
  expect(await loadInbox(rpcBy({ my_notices: { data: null, error: { message: 'x' } } }))).toEqual({ notices: [], presents: [] })
  expect(await loadInbox({ rpc: () => { throw new Error('boom') } })).toEqual({ notices: [], presents: [] })
})

test('受け取りは番号を渡し、返事を読む。失敗は null', async () => {
  const c = rpcBy({ claim_present: { data: [{ coins_awarded: 50, status: 'ok' }] } })
  expect(await claimPresent(2, c)).toEqual({ coins: 50, status: 'ok' })
  expect(c.rpc).toHaveBeenCalledWith('claim_present', { p_present_id: 2 })
  expect(await claimPresent(2, rpcBy({ claim_present: { data: null, error: { message: 'x' } } }))).toBeNull()
})

beforeEach(() => localStorage.clear())

test('読んだ番号は人ごとに残る', () => {
  expect(loadRead('u1').size).toBe(0)
  markRead('u1', [3, 4])
  expect([...loadRead('u1')].sort()).toEqual([3, 4])
  expect(loadRead('u2').size).toBe(0)
  localStorage.setItem('mogumo.noticesRead.u3', '{壊れた')
  expect(loadRead('u3').size).toBe(0)
})
