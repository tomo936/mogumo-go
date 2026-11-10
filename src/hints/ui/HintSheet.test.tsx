import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { HintSheet } from './HintSheet.tsx'
import { hint } from './fixtures.ts'

test('ジャンル・ひとこと・予算・向きと距離・ごほうびが出て、店名は出ない', () => {
  render(<HintSheet hint={hint('a')} distanceM={400} direction="北東" onClose={() => {}} />)
  expect(screen.getByText('北東へ 約400m')).toBeInTheDocument()
  expect(screen.getByText('見つけたら +40')).toBeInTheDocument()
  expect(screen.getByText('中華？')).toBeInTheDocument()
  expect(screen.getByText('…自家製麺の濃厚つけ麺…')).toBeInTheDocument()
  expect(screen.getByText('予算 1,000円台')).toBeInTheDocument()
  expect(screen.getByText('30m まで近づくと正体が分かるよ')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('秘密亭')
  expect(screen.queryByText('Powered by ホットペッパーグルメ Webサービス')).not.toBeInTheDocument()
})

test('謎の気配は「正体は行ってみてのお楽しみ」。閉じるボタンが効く', async () => {
  const onClose = vi.fn()
  render(<HintSheet hint={hint('a', { isMystery: true, genre: null, catch: null, budget: null })} distanceM={null} onClose={onClose} />)
  expect(screen.getByText('正体は行ってみてのお楽しみ')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
  expect(onClose).toHaveBeenCalled()
})

test('向きが分からないときは「ここから」', () => {
  render(<HintSheet hint={hint('a')} distanceM={80} onClose={() => {}} />)
  expect(screen.getByText('ここから 約80m')).toBeInTheDocument()
})
