import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { GachaScreen } from './GachaScreen.tsx'

const setup = (coins: number | null, extra: Partial<Parameters<typeof GachaScreen>[0]> = {}) => {
  const onDraw = vi.fn()
  render(<GachaScreen coins={coins} owned={new Map()} pullsSinceFive={12} busy={false} error={null} onDraw={onDraw} onClose={() => {}} {...extra} />)
  return onDraw
}
const one = () => screen.getByRole('button', { name: /1回まわす/ })
const ten = () => screen.getByRole('button', { name: /10回まわす/ })

test('コイン 99 なら 1 回も押せない', () => {
  setup(99)
  expect(one()).toBeDisabled()
  expect(ten()).toBeDisabled()
})

test('コイン 999 なら 1 回だけ押せて、種類を渡す', async () => {
  const onDraw = setup(999)
  expect(ten()).toBeDisabled()
  await userEvent.click(one())
  expect(onDraw).toHaveBeenCalledWith('single')
})

test('1000 あれば 10 回も押せる。★4 以上確定の札', async () => {
  const onDraw = setup(1000)
  expect(screen.getByText('★4以上1体確定！')).toBeInTheDocument()
  await userEvent.click(ten())
  expect(onDraw).toHaveBeenCalledWith('ten')
})

test('★5 確定まであと何回', () => {
  setup(0)
  expect(screen.getByText(/★5 確定まで あと 18 回/)).toBeInTheDocument()
})

test('出る確率: ★ごとの率と入っているキャラ', async () => {
  setup(0)
  await userEvent.click(screen.getByRole('button', { name: '出る確率' }))
  expect(screen.getByText('5%')).toBeInTheDocument()
  for (const n of ['にじいろキリン', 'いちごミルクねこ', 'プリンしば', 'クッキーくま', 'みたらし団子うさぎ']) {
    expect(screen.getAllByText(new RegExp(n)).length).toBeGreaterThan(0)
  }
})

test('まわしている間は押せない・失敗の文', () => {
  setup(5000, { busy: true, error: 'コインが足りません' })
  expect(one()).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('コインが足りません')
})
