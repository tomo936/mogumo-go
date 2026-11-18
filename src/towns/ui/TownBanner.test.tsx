import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TownBanner } from './TownBanner.tsx'
import type { TownNews } from '../domain/progress.ts'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const clear: TownNews = { id: '13112-経堂', name: '経堂', kind: 'clear', coins: 100, town: null }
const complete: TownNews = { id: '13112-経堂', name: '経堂', kind: 'complete', coins: 0, town: null }

test('クリアの文とコインが出て、4秒で onDone', () => {
  const onDone = vi.fn()
  render(<TownBanner news={clear} onDone={onDone} />)
  expect(screen.getByRole('status')).toHaveTextContent('経堂 クリア！')
  expect(screen.getByRole('status')).toHaveTextContent('+100')
  act(() => { vi.advanceTimersByTime(3900) })
  expect(onDone).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(200) })
  expect(onDone).toHaveBeenCalledTimes(1)
})

test('コンプリートの文。コインは出ない', () => {
  render(<TownBanner news={complete} onDone={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('経堂 コンプリート！')
  expect(screen.getByRole('status')).not.toHaveTextContent('+')
})

test('タップで消える', () => {
  const onDone = vi.fn()
  render(<TownBanner news={clear} onDone={onDone} />)
  fireEvent.click(screen.getByRole('status'))
  expect(onDone).toHaveBeenCalledTimes(1)
})

test('知らせが無ければ何も出ない・onDone も呼ばない', () => {
  const onDone = vi.fn()
  const { container } = render(<TownBanner news={null} onDone={onDone} />)
  expect(container).toBeEmptyDOMElement()
  act(() => { vi.advanceTimersByTime(5000) })
  expect(onDone).not.toHaveBeenCalled()
})

test('次の知らせに替わると、そこからまた4秒', () => {
  const onDone = vi.fn()
  const { rerender } = render(<TownBanner news={clear} onDone={onDone} />)
  act(() => { vi.advanceTimersByTime(3000) })
  rerender(<TownBanner news={complete} onDone={onDone} />)
  act(() => { vi.advanceTimersByTime(3000) })
  expect(onDone).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(1100) })
  expect(onDone).toHaveBeenCalledTimes(1)
})
