import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CheckinEffect } from './CheckinEffect.tsx'

vi.mock('./confetti.ts', () => ({ startConfetti: () => () => {} }))

const setReduced = (reduced: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: reduced && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as never
}
beforeEach(() => { vi.useFakeTimers(); setReduced(false) })
afterEach(() => vi.useRealTimers())

test('30コインのバナーと、0コインのバナー', () => {
  const { unmount } = render(<CheckinEffect coins={30} onDone={() => {}} />)
  expect(screen.getByText('チェックイン完了')).toBeInTheDocument()
  expect(screen.getByText('+30 コイン')).toBeInTheDocument()
  unmount()
  render(<CheckinEffect coins={0} onDone={() => {}} />)
  expect(screen.getByText('今日のコインは受け取り済み')).toBeInTheDocument()
  expect(screen.queryByText('+30 コイン')).not.toBeInTheDocument()
})

test('約3秒後に onDone が1回だけ呼ばれる', () => {
  const onDone = vi.fn()
  render(<CheckinEffect coins={30} onDone={onDone} />)
  act(() => { vi.advanceTimersByTime(2900) })
  expect(onDone).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(300) })
  expect(onDone).toHaveBeenCalledTimes(1)
  act(() => { vi.advanceTimersByTime(5000) })
  expect(onDone).toHaveBeenCalledTimes(1)
})

test('タップで飛ばすと onDone が1回。終わったあとのタップでは呼ばれない', () => {
  const onDone = vi.fn()
  render(<CheckinEffect coins={30} onDone={onDone} />)
  fireEvent.click(screen.getByTestId('checkin-effect'))
  expect(onDone).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByTestId('checkin-effect'))
  act(() => { vi.advanceTimersByTime(5000) })
  expect(onDone).toHaveBeenCalledTimes(1)
})

test('動きを減らす設定では紙吹雪の canvas を出さない', () => {
  render(<CheckinEffect coins={30} onDone={() => {}} />)
  expect(screen.getByTestId('checkin-confetti')).toBeInTheDocument()
  setReduced(true)
  const { container } = render(<CheckinEffect coins={30} onDone={() => {}} />)
  expect(container.querySelector('[data-testid="checkin-confetti"]')).toBeNull()
  expect(container.textContent).toContain('チェックイン完了')
})

test('40 なら「+40 コイン（気配ボーナス +10）」', () => {
  render(<CheckinEffect coins={40} onDone={() => {}} />)
  expect(screen.getByText('+40 コイン（気配ボーナス +10）')).toBeInTheDocument()
})

test('reveal があれば帯に「『○○亭』だった！」が出る。無ければ出ない', () => {
  const { unmount } = render(<CheckinEffect coins={40} reveal="○○亭" onDone={() => {}} />)
  expect(screen.getByText('『○○亭』だった！')).toBeInTheDocument()
  unmount()
  render(<CheckinEffect coins={30} onDone={() => {}} />)
  expect(screen.queryByText(/だった！/)).not.toBeInTheDocument()
})

test('経験値とレベルアップを帯に出す（0 のときは出さない）', () => {
  const { unmount } = render(<CheckinEffect coins={30} exp={10} levelUp={3} onDone={() => {}} />)
  expect(screen.getByText('+10 EXP')).toBeInTheDocument()
  expect(screen.getByText('Lv 3 になった！')).toBeInTheDocument()
  unmount()
  render(<CheckinEffect coins={0} exp={0} onDone={() => {}} />)
  expect(screen.queryByText(/EXP/)).not.toBeInTheDocument()
  expect(screen.queryByText(/になった/)).not.toBeInTheDocument()
})
