import { expect, it, vi } from 'vitest'
import { LIMITS, overLimit } from './rateLimit.ts'

const db = (result: { data: unknown; error: unknown } | Error) => ({
  rpc: vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  }),
})

it('DB が false（上限を超えた）と言ったときだけ止める。窓は 10 分、上限は関数ごと', async () => {
  const d = db({ data: false, error: null })
  expect(await overLimit(d, 'u1', 'shops-hotpepper')).toBe(true)
  expect(d.rpc).toHaveBeenCalledWith('rate_limit_hit', { p_user: 'u1', p_key: 'shops-hotpepper', p_window_s: 600, p_max: LIMITS['shops-hotpepper'] })
  expect(await overLimit(db({ data: true, error: null }), 'u1', 'checkin')).toBe(false)
})

it('数え損ねたとき（エラー・例外）は止めない', async () => {
  expect(await overLimit(db({ data: null, error: { message: 'x' } }), 'u1', 'towns')).toBe(false)
  expect(await overLimit(db(new Error('net')), 'u1', 'towns')).toBe(false)
})
