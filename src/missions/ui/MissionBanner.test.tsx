import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MissionBanner } from './MissionBanner.tsx'

test('達成の帯: 名前とごほうび。タップで消える', async () => {
  const onDone = vi.fn()
  render(<MissionBanner mission={{ id: 'm', difficulty: 'hard', type: 'weekend', key: 'weekend', kinds: [], target: 3, progress: 3, reward: 150, completed: true }} onDone={onDone} />)
  expect(screen.getByText('ミッション達成！')).toBeInTheDocument()
  expect(screen.getByText('むずかしい・週末の冒険')).toBeInTheDocument()
  expect(screen.getByText('+150')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('status'))
  expect(onDone).toHaveBeenCalled()
})
