import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Splash } from './Splash.tsx'
import { CreditsButton } from './CreditsButton.tsx'
import { loading } from './loadingGate.ts'

beforeEach(() => {
  vi.useFakeTimers()
  loading.reset()
})
afterEach(() => vi.useRealTimers())

test('起動時のタイトル画面に地図の出典が出る。「タップしてスタート」を押すまで出したまま', () => {
  render(<Splash />)
  expect(screen.getByText('地図: OpenFreeMap © OpenMapTiles')).toBeInTheDocument()
  expect(screen.getByText('データ: © OpenStreetMap contributors')).toBeInTheDocument()
  expect(screen.getByText('Powered by ホットペッパーグルメ Webサービス')).toBeInTheDocument()
  expect(screen.getByText('地名検索: 国土地理院')).toBeInTheDocument()
  expect(screen.getByText('町の境目: 「国勢調査 町丁・字等別境界データ」（総務省統計局・e-Stat）を加工して作成')).toBeInTheDocument()
  expect(screen.getByText('図鑑の字体: M PLUS Rounded 1c（SIL Open Font License 1.1）')).toBeInTheDocument()
  expect(screen.getByText('チェーン店の判定: name-suggestion-index（OpenStreetMap, BSD-3-Clause）')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(60000))
  act(() => screen.getByRole('button', { name: /タップしてスタート/ }).click())
  expect(screen.queryByText('地名検索: 国土地理院')).not.toBeInTheDocument()
})

test('「タップしてスタート」はすぐ出る。押すと、お店を読んでいる間は右下に「読み込み中」、そろったらメインへ（2026-11-16 オーナー「OP はなし」）', () => {
  loading.start()
  render(<Splash />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  act(() => screen.getByRole('button', { name: /タップしてスタート/ }).click())
  expect(screen.getByRole('status')).toHaveTextContent('読み込み中')
  expect(screen.queryByText('タップしてスタート')).not.toBeInTheDocument()
  act(() => loading.done())
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('タイトルを閉じると、雲が左右に開く演出を出して地図へ（カメラが空から降りる合図 loading.onEnter も出す）。演出が終わったら消える（2026-11-16 オーナー「空から来たような感じ」）', () => {
  const entered = vi.fn()
  const stop = loading.onEnter(entered)
  loading.start()
  loading.done()
  render(<Splash />)
  act(() => screen.getByRole('button', { name: /タップしてスタート/ }).click())
  expect(entered).toHaveBeenCalledTimes(1)
  const intro = screen.getByTestId('sky-intro')
  expect(screen.queryByText('地名検索: 国土地理院')).not.toBeInTheDocument()
  act(() => { intro.dispatchEvent(new Event('animationend', { bubbles: true })) })
  expect(screen.queryByTestId('sky-intro')).not.toBeInTheDocument()
  stop()
})

test('もうそろっていれば、押したらすぐメインへ', () => {
  loading.start()
  loading.done()
  render(<Splash />)
  act(() => screen.getByRole('button', { name: /タップしてスタート/ }).click())
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('そろわなくても、起動から 8 秒でメインへ（押したあと）', () => {
  loading.start()
  render(<Splash />)
  act(() => screen.getByRole('button', { name: /タップしてスタート/ }).click())
  act(() => vi.advanceTimersByTime(7999))
  expect(screen.getByRole('status')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('出典ボタンで詳しい出典とリンクが見られる', () => {
  render(<CreditsButton />)
  act(() => screen.getByRole('button', { name: '出典' }).click())
  expect(screen.getByRole('link', { name: 'OpenFreeMap' })).toHaveAttribute('href', 'https://openfreemap.org/')
  expect(screen.getByRole('link', { name: 'OpenMapTiles' })).toHaveAttribute('href', 'https://www.openmaptiles.org/')
  expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  expect(screen.getByRole('link', { name: 'Powered by ホットペッパーグルメ Webサービス' })).toHaveAttribute('href', 'https://webservice.recruit.co.jp/')
  act(() => screen.getByRole('button', { name: '閉じる' }).click())
  expect(screen.queryByRole('link', { name: 'OpenFreeMap' })).not.toBeInTheDocument()
})
