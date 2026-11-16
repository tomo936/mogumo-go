import { expect, test, vi } from 'vitest'
import { claimLoginBonus, loadLoginBonusState } from './loginBonusApi.ts'

const rpc = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(() => Promise.resolve({ data, error })) })

test('受け取れたら、スタンプの番号と枚数を返す', async () => {
  const c = rpc([{ stamp_no: 3, coins_awarded: 10, claimed_now: true }])
  expect(await claimLoginBonus(c)).toEqual({ stampNo: 3, coins: 10, claimedNow: true })
  expect(c.rpc).toHaveBeenCalledWith('claim_login_bonus')
})

test('失敗・壊れた返事・例外は null（アプリは止まらない）', async () => {
  expect(await claimLoginBonus(rpc(null, { message: 'x' }))).toBeNull()
  expect(await claimLoginBonus(rpc([{ stamp_no: 99 }]))).toBeNull()
  expect(await claimLoginBonus({ rpc: () => { throw new Error('boom') } })).toBeNull()
  expect(await loadLoginBonusState(rpc(undefined))).toBeNull()
})

test('状態を読む', async () => {
  expect(await loadLoginBonusState(rpc([{ total: 2, claimed_today: false }]))).toEqual({ total: 2, claimedToday: false })
})
