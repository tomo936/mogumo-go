import { expect, test, vi } from 'vitest'
import { searchPlaces } from './placeSearch.ts'

const ok = (body: unknown) => vi.fn(async () => ({ ok: true, json: async () => body }) as Response)

test('URL に言葉が入り、結果を読む', async () => {
  const f = ok([{ geometry: { coordinates: [140.7, 41.7] }, properties: { title: '函館市' } }])
  const r = await searchPlaces('函館', f as unknown as typeof fetch)
  expect((f.mock.calls[0] as unknown[])[0]).toContain(encodeURIComponent('函館'))
  expect(r).toEqual([{ title: '函館市', lat: 41.7, lng: 140.7 }])
})

test('1 文字では fetch しない', async () => {
  const f = ok([])
  expect(await searchPlaces(' 函 ', f as unknown as typeof fetch)).toEqual([])
  expect(f).not.toHaveBeenCalled()
})

test('500 で throw', async () => {
  const f = vi.fn(async () => ({ ok: false }) as Response)
  await expect(searchPlaces('函館', f as unknown as typeof fetch)).rejects.toThrow()
})
