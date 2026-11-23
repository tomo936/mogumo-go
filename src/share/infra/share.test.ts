import { expect, test, vi } from 'vitest'
import { shareOut } from './share.ts'

const t = { title: 'もぐもGO', text: 'x', url: 'https://mogumo-go.vercel.app' }

test('共有の画面があればそれで共有する', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  expect(await shareOut(t, { share } as unknown as Navigator)).toBe('shared')
  expect(share).toHaveBeenCalledWith(t)
})

test('共有の画面を閉じただけなら cancelled', async () => {
  const share = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'))
  expect(await shareOut(t, { share } as unknown as Navigator)).toBe('cancelled')
})

test('共有の画面が無ければ文をコピーする', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  expect(await shareOut(t, { clipboard: { writeText } } as unknown as Navigator)).toBe('copied')
  expect(writeText).toHaveBeenCalledWith('x\nhttps://mogumo-go.vercel.app')
})
