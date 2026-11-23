import { expect, test, vi } from 'vitest'
import { drawCluster } from './shopClusters.ts'

// 読み出す絵は CPU 側のキャンバスで描く（GPU 側だと読み出しのたびに地図の描画を待ち、1 回に数百 ms〜数秒かかった。2026-11-24）
test('まとめのピンの絵は willReadFrequently のキャンバスで描く', () => {
  const ctx = {
    drawImage: vi.fn(), measureText: () => ({ width: 100, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 50, actualBoundingBoxAscent: 40, actualBoundingBoxDescent: 0 }),
    fillText: vi.fn(), getImageData: () => ({ width: 256, height: 256 }), font: '', textAlign: '', textBaseline: '', fillStyle: '',
  }
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  drawCluster({} as CanvasImageSource, 5)
  expect(spy).toHaveBeenCalledWith('2d', { willReadFrequently: true })
  spy.mockRestore()
})
