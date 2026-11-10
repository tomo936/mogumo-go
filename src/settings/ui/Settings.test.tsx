import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Settings } from './Settings.tsx'

const show = (o: Partial<Parameters<typeof Settings>[0]> = {}) => {
  const p = { email: 'mogu@example.com', pinsHidden: false, onTogglePins: vi.fn(), onSignOut: vi.fn(), onClose: vi.fn(), ...o }
  render(<Settings {...p} />)
  return p
}

test('ピンのスイッチで onTogglePins（出しているときは ON）', async () => {
  const p = show()
  const sw = screen.getByRole('switch', { name: 'お店のピンを出す' })
  expect(sw).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(sw)
  expect(p.onTogglePins).toHaveBeenCalled()
})

test('ログイン中のメールとログアウト', async () => {
  const p = show()
  expect(screen.getByText('mogu@example.com')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /ログアウト/ }))
  expect(p.onSignOut).toHaveBeenCalled()
})

test('お問い合わせはフォームの URL が無いあいだ準備中', () => {
  show()
  expect(screen.getByText('お問い合わせ・不具合の報告').closest('[aria-disabled="true"]')).not.toBeNull()
  expect(screen.queryByRole('link', { name: /お問い合わせ/ })).not.toBeInTheDocument()
})

test('ホットペッパーの表示（リンク）とバージョンがある', () => {
  show()
  expect(screen.getByRole('link', { name: 'Powered by ホットペッパーグルメ Webサービス' })).toHaveAttribute('href', 'http://webservice.recruit.co.jp/')
  expect(screen.getByText('バージョン')).toBeInTheDocument()
})

test('位置情報の使い方を押すと説明が開く、出典も開く', async () => {
  show()
  await userEvent.click(screen.getByRole('button', { name: /位置情報の使い方/ }))
  expect(screen.getByText(/サーバーには送りません/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '出典・クレジット' }))
  expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' })).toBeInTheDocument()
})

test('準備中のスイッチは押せない、戻るで閉じる', async () => {
  const p = show()
  expect(screen.getByRole('switch', { name: '軽量モード' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '戻る' }))
  expect(p.onClose).toHaveBeenCalled()
})
