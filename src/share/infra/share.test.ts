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

test('画像を送れる端末は、画像のファイルを付けて共有する', async () => {
  const { shareImage } = await import('./share.ts')
  const share = vi.fn().mockResolvedValue(undefined)
  const canShare = vi.fn().mockReturnValue(true)
  const r = await shareImage(new Blob(['x'], { type: 'image/png' }), t, { share, canShare } as unknown as Navigator)
  expect(r).toBe('shared')
  const arg = share.mock.calls[0][0]
  expect(arg.files[0].name).toBe('mogumo-go.png')
  expect(arg.text).toContain('https://mogumo-go.vercel.app')
})
