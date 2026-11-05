import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { LocationOverlay } from './LocationOverlay.tsx'
import type { LocationStatus } from '../domain/locationStatus.ts'

const show = (status: LocationStatus) => {
  const onRetry = vi.fn()
  const onReload = vi.fn()
  const view = render(<LocationOverlay status={status} onRetry={onRetry} onReload={onReload} />)
  return { onRetry, onReload, view }
}

test('探索中', () => {
  show('searching')
  expect(screen.getByText('現在地を探しています…')).toBeInTheDocument()
})

test('途切れたときは小さな帯', () => {
  show('waiting')
  expect(screen.getByText('位置情報を待っています…')).toBeInTheDocument()
})

test('断られたときは設定の案内と再読み込み', async () => {
  const { onReload } = show('denied')
  expect(screen.getByText('位置情報がオフになっています')).toBeInTheDocument()
  expect(
    screen.getByText(
      'iPhone の『設定』→『プライバシーとセキュリティ』→『位置情報サービス』→『Safari の Web サイト』で『使用中のみ』にしてから、このページを再読み込みしてください',
    ),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
  expect(onReload).toHaveBeenCalledTimes(1)
})

test('見つからないときはもう一度試す', async () => {
  const { onRetry } = show('notFound')
  expect(screen.getByText('現在地が見つかりません')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'もう一度試す' }))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

test('追いかけ中は何も出さない', () => {
  const { view } = show('tracking')
  expect(view.container).toBeEmptyDOMElement()
})
