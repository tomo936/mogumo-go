import { expect, test, vi } from 'vitest'
import { bodyOk, parseSendResult } from './domain/inquiry.ts'
import { sendInquiry } from './infra/contactApi.ts'

test('本文は前後の空白を除いて 1〜2000 文字', () => {
  expect(bodyOk('  ')).toBe(false)
  expect(bodyOk('あ')).toBe(true)
  expect(bodyOk('あ'.repeat(2000))).toBe(true)
  expect(bodyOk('あ'.repeat(2001))).toBe(false)
})

test('返事の読み取り: 知らない返事は failed', () => {
  expect(parseSendResult('ok')).toBe('ok')
  expect(parseSendResult('too_many')).toBe('too_many')
  expect(parseSendResult(null)).toBe('failed')
})

test('送るときは種類・前後の空白を除いた本文・版を渡す。失敗は failed', async () => {
  const c = { rpc: vi.fn(() => Promise.resolve({ data: 'ok', error: null })) }
  expect(await sendInquiry('bug', '  動かない \n', '0.1.0（abc）', c)).toBe('ok')
  expect(c.rpc).toHaveBeenCalledWith('send_inquiry', expect.objectContaining({ p_category: 'bug', p_body: '動かない', p_app_version: '0.1.0（abc）' }))
  expect(await sendInquiry('bug', 'x', '', { rpc: () => Promise.resolve({ data: null, error: { message: 'x' } }) })).toBe('failed')
  expect(await sendInquiry('bug', 'x', '', { rpc: () => { throw new Error('boom') } })).toBe('failed')
})
