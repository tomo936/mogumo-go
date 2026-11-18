import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MaintenanceGate } from './MaintenanceGate.tsx'
import type { MaintenanceStatus } from '../domain/maintenance.ts'

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.useRealTimers())

const on: MaintenanceStatus = { on: true, message: '新しい町を追加しています', endsAt: null }
const off: MaintenanceStatus = { on: false, message: '', endsAt: null }

test('メンテ中ならアプリを外してメンテの画面だけ', async () => {
  render(<MaintenanceGate load={() => Promise.resolve(on)}><p>アプリ</p></MaintenanceGate>)
  expect(await screen.findByText('ただいまメンテナンス中ポコ！')).toBeInTheDocument()
  expect(screen.getByText('新しい町を追加しています')).toBeInTheDocument()
  expect(screen.queryByText('アプリ')).not.toBeInTheDocument()
})

test('メンテでない・読めないときはそのまま遊べる', async () => {
  const { unmount } = render(<MaintenanceGate load={() => Promise.resolve(off)}><p>アプリ</p></MaintenanceGate>)
  expect(await screen.findByText('アプリ')).toBeInTheDocument()
  unmount()
  render(<MaintenanceGate load={() => Promise.resolve(null)}><p>アプリ</p></MaintenanceGate>)
  expect(await screen.findByText('アプリ')).toBeInTheDocument()
})

test('「もう一度確かめる」で終わっていればアプリに戻る', async () => {
  const load = vi.fn<() => Promise<MaintenanceStatus | null>>().mockResolvedValueOnce(on).mockResolvedValue(off)
  render(<MaintenanceGate load={load}><p>アプリ</p></MaintenanceGate>)
  await userEvent.click(await screen.findByRole('button', { name: 'もう一度確かめる' }))
  expect(await screen.findByText('アプリ')).toBeInTheDocument()
})

test('開いている間は 1 分ごとに確かめ、メンテに入ったら切り替わる', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const load = vi.fn<() => Promise<MaintenanceStatus | null>>().mockResolvedValueOnce(off).mockResolvedValue(on)
  render(<MaintenanceGate load={load}><p>アプリ</p></MaintenanceGate>)
  expect(await screen.findByText('アプリ')).toBeInTheDocument()
  await act(async () => { vi.advanceTimersByTime(60_000) })
  expect(await screen.findByText('ただいまメンテナンス中ポコ！')).toBeInTheDocument()
})

test('?debug で開いたときはメンテ中でも通す（オーナーの確認用）', async () => {
  sessionStorage.setItem('mogumo.debug', '1')
  render(<MaintenanceGate load={() => Promise.resolve(on)}><p>アプリ</p></MaintenanceGate>)
  await act(async () => {})
  expect(screen.getByText('アプリ')).toBeInTheDocument()
})
