import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { RevealBanner } from './RevealBanner.tsx'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('店名入りの文が出て、3秒で onDone', () => {
  const onDone = vi.fn()
  render(<RevealBanner name="○○亭" onDone={onDone} />)
  expect(screen.getByText('気配の正体は…『○○亭』！')).toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(2900) })
  expect(onDone).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(200) })
  expect(onDone).toHaveBeenCalledTimes(1)
})
