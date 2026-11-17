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

test('起動時のタイトル画面には、要る出典だけ（地図とホットペッパー）。「タップしてスタート」を押すまで出したまま（2026-11-17 オーナー「最小限に」）', () => {
  render(<Splash />)
  const map = 'OpenStreetMap contributors'
  expect(screen.getByText(new RegExp(map))).toHaveTextContent('地図 © OpenStreetMap contributors · OpenMapTiles · OpenFreeMap')
  expect(screen.getByText('Powered by ホットペッパーグルメ Webサービス')).toBeInTheDocument()
  // ほかの出典は設定の「出典」に（タイトルには出さない）
  expect(screen.queryByText(/国土地理院|e-Stat|M PLUS|name-suggestion/)).not.toBeInTheDocument()
  act(() => vi.advanceTimersByTime(60000))
  act(() => screen.getByRole('button', { name: /タップしてスタート/ }).click())
  expect(screen.queryByText(new RegExp(map))).not.toBeInTheDocument()
})

test('起動直後の index.html のタイトル（#boot）は、アプリのタイトルが出たら消す', () => {
  const boot = document.createElement('div')
  boot.id = 'boot'
  document.body.appendChild(boot)
  render(<Splash />)
  expect(document.getElementById('boot')).toBeNull()
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

test('タイトルを閉じると、タイトルの絵がふわっと消える演出を出して地図へ（カメラが空から降りる合図 loading.onEnter も出す）。演出が終わったら消える（2026-11-16 オーナー「空から来たような感じ」）', () => {
  const entered = vi.fn()
  const stop = loading.onEnter(entered)
  loading.start()
  loading.done()
  render(<Splash />)
  act(() => screen.getByRole('button', { name: /タップしてスタート/ }).click())
  expect(entered).toHaveBeenCalledTimes(1)
  const intro = screen.getByTestId('sky-intro')
  expect(screen.queryByText(/OpenStreetMap contributors/)).not.toBeInTheDocument()
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

test('行き先を決めている途中（読み込み中…の画面）に押しても、タイトルは消さない。地図の画面ができたらお店の待ちに引き継ぐ（2026-11-18 オーナー「タップすると一瞬マップが見える」）', () => {
  const release = loading.hold() // ログインの確認中
  render(<Splash />)
  act(() => screen.getByRole('button', { name: /タップしてスタート/ }).click())
  expect(screen.queryByTestId('sky-intro')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('読み込み中')
  act(() => {
    release() // 確認が終わって、同じ描画で地図の画面ができた
    loading.start()
  })
  expect(screen.queryByTestId('sky-intro')).not.toBeInTheDocument()
  act(() => loading.done())
  expect(screen.getByTestId('sky-intro')).toBeInTheDocument()
})
