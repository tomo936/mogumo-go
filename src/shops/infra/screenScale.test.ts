import { expect, test } from 'vitest'
import { localFrame } from '../../map/domain/geo.ts'
import { screenScale } from './screenScale.ts'

// 1m = k px、bearing b（度）、pitch p（度）の平行投影のにせ物（地面の点だけ）
const fake = (k: number, b: number, p: number) => {
  const f = localFrame({ lat: 35, lng: 139 })
  const br = (b * Math.PI) / 180
  const c = Math.cos((p * Math.PI) / 180)
  return (q: { lat: number; lng: number }) => {
    const m = f.to(q)
    const x = m.x * Math.cos(br) - m.y * Math.sin(br)
    const y = m.x * Math.sin(br) + m.y * Math.cos(br)
    return { x: x * k, y: -y * k * c }
  }
}
const at = { lat: 35, lng: 139 }

test('回して傾けても、1m あたりの px は同じ', () => {
  for (const b of [0, 30, 90, 135]) expect(screenScale(fake(4, b, 60), at).pxPerM).toBeCloseTo(4, 2)
})

test('高さ 1m は傾きに合わせて縮む（真上から 0、60度で sin60）', () => {
  expect(screenScale(fake(4, 45, 60), at).pxPerUpM).toBeCloseTo(4 * Math.sin(Math.PI / 3), 2)
  expect(screenScale(fake(4, 45, 0), at).pxPerUpM).toBeCloseTo(0, 2)
})
