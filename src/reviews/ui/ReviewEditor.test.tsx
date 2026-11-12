import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ReviewEditor } from './ReviewEditor.tsx'
import type { Review } from '../domain/review.ts'

const saved: Review = { id: 'r1', checkinId: 'c1', shopId: 'hp:A', userId: 'me', stars: 4, body: 'うまい', photoPath: null, isPublic: true, createdAt: '2026-11-03T03:00:00Z', nickname: null }

function show(over: Partial<Parameters<typeof ReviewEditor>[0]> = {}) {
  const p = {
    shopName: '麺屋A', shopId: 'hp:A', checkinId: 'c1', visitDay: '2026-11-03', existing: null, existingPhotoUrl: null,
    onSaved: vi.fn(), onDeleted: vi.fn(), onClose: vi.fn(),
    save: vi.fn(async () => saved), remove: vi.fn(async () => {}),
    ...over,
  }
  render(<ReviewEditor {...p} />)
  return p
}

test('星を選ぶまで保存できない', async () => {
  show()
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  await userEvent.click(screen.getByRole('radio', { name: '星 4' }))
  expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
})

test('星とひとことで保存。既定は公開・写真はそのまま', async () => {
  const p = show()
  await userEvent.click(screen.getByRole('radio', { name: '星 4' }))
  await userEvent.type(screen.getByLabelText('ひとこと'), 'うまい')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(p.save).toHaveBeenCalledWith({ shopId: 'hp:A', checkinId: 'c1', existing: null, stars: 4, body: 'うまい', isPublic: true, photo: { kind: 'keep' } })
  await waitFor(() => expect(p.onSaved).toHaveBeenCalledWith(saved))
})

test('「みんなに見せる」をオフにすると自分だけ', async () => {
  const p = show()
  await userEvent.click(screen.getByRole('radio', { name: '星 3' }))
  await userEvent.click(screen.getByRole('switch', { name: 'みんなに見せる' }))
  expect(screen.getByText('自分だけ')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(p.save).toHaveBeenCalledWith(expect.objectContaining({ isPublic: false, body: null }))
})

test('501 文字は保存できない', async () => {
  const p = show()
  await userEvent.click(screen.getByRole('radio', { name: '星 3' }))
  fireEvent.change(screen.getByLabelText('ひとこと'), { target: { value: 'あ'.repeat(501) } })
  expect(screen.getByRole('alert')).toHaveTextContent('500 文字までです')
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  expect(p.save).not.toHaveBeenCalled()
})

test('保存に失敗したら文を出し、入力は残る', async () => {
  const p = show({ save: vi.fn(async () => { throw new Error('x') }) })
  await userEvent.click(screen.getByRole('radio', { name: '星 5' }))
  await userEvent.type(screen.getByLabelText('ひとこと'), 'のこる')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存できませんでした。もう一度押してください')
  expect(screen.getByLabelText('ひとこと')).toHaveValue('のこる')
  expect(screen.getByRole('radio', { name: '星 5' })).toBeChecked()
  expect(p.onSaved).not.toHaveBeenCalled()
})

test('使えない写真は「この写真は使えませんでした」', async () => {
  show({ save: vi.fn(async () => { throw new Error('photo_unusable') }) })
  await userEvent.click(screen.getByRole('radio', { name: '星 5' }))
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('この写真は使えませんでした')
})

test('保存中は「保存しています…」で押せない', async () => {
  let done: (r: Review) => void = () => {}
  show({ save: vi.fn(() => new Promise<Review>((res) => { done = res })) })
  await userEvent.click(screen.getByRole('radio', { name: '星 5' }))
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(screen.getByRole('button', { name: '保存しています…' })).toBeDisabled()
  done(saved)
})

test('直すとき: 前の値が入り、写真を外すと remove、消すは確認してから', async () => {
  const existing = { ...saved, photoPath: 'me/a.jpg', isPublic: false }
  const p = show({ existing, existingPhotoUrl: 'https://s/a' })
  expect(screen.getByRole('radio', { name: '星 4' })).toBeChecked()
  expect(screen.getByLabelText('ひとこと')).toHaveValue('うまい')
  expect(screen.getByRole('switch', { name: 'みんなに見せる' })).toHaveAttribute('aria-checked', 'false')
  await userEvent.click(screen.getByRole('button', { name: '外す' }))
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(p.save).toHaveBeenCalledWith(expect.objectContaining({ existing, photo: { kind: 'remove' } }))

  await userEvent.click(screen.getByRole('button', { name: 'この感想を消す' }))
  expect(p.remove).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '消す' }))
  expect(p.remove).toHaveBeenCalledWith(existing)
  await waitFor(() => expect(p.onDeleted).toHaveBeenCalled())
})

test('写真を選ぶと new で送る', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  const p = show()
  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
  await userEvent.upload(screen.getByLabelText('写真を選ぶ'), file)
  await userEvent.click(screen.getByRole('radio', { name: '星 2' }))
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(p.save).toHaveBeenCalledWith(expect.objectContaining({ photo: { kind: 'new', file } }))
})
