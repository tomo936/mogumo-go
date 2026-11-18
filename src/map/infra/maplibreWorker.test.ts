import { expect, test, vi } from 'vitest'

const setWorkerUrl = vi.hoisted(() => vi.fn())
vi.mock('maplibre-gl', () => ({ setWorkerUrl }))

test('地図の部品のワーカーの置き場所を、ビルドが出力した URL に設定する', async () => {
  await import('./maplibreWorker.ts')
  expect(setWorkerUrl).toHaveBeenCalledTimes(1)
  expect(setWorkerUrl.mock.calls[0][0]).toMatch(/maplibre-gl-worker.*\.mjs/)
})
