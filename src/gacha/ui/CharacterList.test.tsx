import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { CharacterList } from './CharacterList.tsx'

const setup = (onPick = vi.fn(async () => true)) => {
  render(<CharacterList owned={new Map([[5, 2], [14, 0]])} currentId={101} onPick={onPick} onClose={() => {}} />)
  return onPick
}
const big = () => screen.getByRole('region', { name: '選んでいるキャラ' })

test('持っている数と、使っているキャラが上に出る', () => {
  setup()
  expect(screen.getByText('4 / 32')).toBeInTheDocument()
  expect(big()).toHaveTextContent('男の子')
  expect(screen.getByRole('button', { name: '使っています' })).toBeDisabled()
})

test('持っていないキャラは押せない', () => {
  setup()
  expect(screen.getByRole('button', { name: /星降るキリン/ })).toBeDisabled()
})

test('押すと上が替わり、このキャラにする で onPick', async () => {
  const onPick = setup()
  await userEvent.click(screen.getByRole('button', { name: /いちごミルクねこ/ }))
  expect(big()).toHaveTextContent('いちごミルクねこ')
  expect(big()).toHaveTextContent('♥♥')
  await userEvent.click(screen.getByRole('button', { name: 'このキャラにする' }))
  expect(onPick).toHaveBeenCalledWith(5)
  expect(await screen.findByRole('button', { name: '使っています' })).toBeInTheDocument()
})

test('変えられなかったら知らせる', async () => {
  setup(vi.fn(async () => false))
  await userEvent.click(screen.getByRole('button', { name: /クッキーくま/ }))
  await userEvent.click(screen.getByRole('button', { name: 'このキャラにする' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('変えられませんでした')
})

test('★5 の切り替えで ★5 だけ', async () => {
  setup()
  await userEvent.click(screen.getByRole('tab', { name: '★5' }))
  const list = screen.getByRole('list')
  expect(list.querySelectorAll('li')).toHaveLength(4)
})
