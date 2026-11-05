import { render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

// 地図の部品の偽物。on で登録された処理を、テストから呼び出せるようにする
const handlers = vi.hoisted(() => ({} as Record<string, () => void>))
const center = vi.hoisted(() => ({ lat: 35, lng: 139 }))
vi.mock('maplibre-gl', () => ({
  Map: class {
    touchZoomRotate = { disableRotation() {} }
    on(name: string, fn: () => void) { handlers[name] = fn }
    getCenter() { return center }
    easeTo() {}
    remove() {}
  },
  setWorkerUrl() {},
}))
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

const { HomePickerMap } = await import('./HomePickerMap.tsx')

test('地図が動いている途中でも、中心が変わるたびに知らせる（確定の瞬間の位置を使えるように）', () => {
  const onCenterChange = vi.fn()
  render(<HomePickerMap start={{ lat: 35, lng: 139 }} recenter={0} onCenterChange={onCenterChange} />)
  center.lat = 35.5
  handlers.move?.()
  expect(onCenterChange).toHaveBeenLastCalledWith({ lat: 35.5, lng: 139 })
})
