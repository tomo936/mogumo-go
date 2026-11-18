import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ExploreButton } from './ExploreButton.tsx'

test('「探索」。remaining があれば数字、null なら数字なし', async () => {
  const onClick = vi.fn()
  const { unmount } = render(<ExploreButton remaining={2} onClick={onClick} />)
  expect(screen.getByText('探索')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button'))
  expect(onClick).toHaveBeenCalled()
  unmount()
  render(<ExploreButton remaining={null} onClick={onClick} />)
  expect(screen.queryByText('2')).toBeNull()
})
