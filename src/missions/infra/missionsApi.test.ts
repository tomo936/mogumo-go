import { expect, test, vi } from 'vitest'
import { syncMissions } from './missionsApi.ts'

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
const opts = (fetchFn: typeof fetch) => ({ fetchFn, endpoint: 'https://x/functions/v1/weekly-missions', anonKey: 'anon', getToken: async () => 't' })

test('draw は種類と自宅の有無だけを送る。位置は送らない', async () => {
  const f = ok({ week_end: '2026-11-15', missions: [], newly: [] })
  const w = await syncMissions({ kinds: { ramen: 2 }, hasHome: true }, opts(f as unknown as typeof fetch))
  expect(w).toEqual({ weekEnd: '2026-11-15', missions: [], newly: [] })
  const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
  expect(body).toEqual({ draw: { kinds: { ramen: 2 }, has_home: true } })
})

test('draw なしは空の本文。失敗・ログインなしは null', async () => {
  const f = ok({ week_end: '2026-11-15', missions: [], newly: [] })
  await syncMissions(null, opts(f as unknown as typeof fetch))
  expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({})
  const bad = vi.fn(async () => new Response('x', { status: 500 }))
  expect(await syncMissions(null, opts(bad as unknown as typeof fetch))).toBeNull()
  expect(await syncMissions(null, { ...opts(f as unknown as typeof fetch), getToken: async () => null })).toBeNull()
})
