import { act } from '@testing-library/react'
import { createRoot } from 'react-dom/client'
import { expect, test } from 'vitest'
import { boot } from './boot.tsx'

const message = /VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/

test('環境変数が無いと、真っ白ではなく画面に文言を出す', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => boot(root, undefined, undefined))
  expect(container.textContent).toMatch(message)
  act(() => root.unmount())
})

test('anon キーだけ無くても画面に文言を出す', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => boot(root, 'https://a.supabase.co', ''))
  expect(container.textContent).toMatch(message)
  act(() => root.unmount())
})
