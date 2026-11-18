import { expect, test } from 'vitest'
import { retainNear } from './retain.ts'

// 緯度 0.01 度 ≒ 1.11km
const at = (id: string, dLat: number) => ({ id, lat: 35.65 + dLat, lng: 139.63 })
const me = { lat: 35.65, lng: 139.63 }
const far = { lat: 35.68, lng: 139.63 } // 約 3.3km 北（見ている場所）

test('どの中心からでも半径内なら残し、どこからも遠いものだけ捨てる', () => {
  const items = [at('near-me', 0.002), at('near-far', 0.0295), at('nowhere', 0.015)]
  expect(retainNear(items, [me, far], 1500).map((x) => x.id)).toEqual(['near-me', 'near-far'])
})

test('見ている場所だけを中心にすると自分のまわりが消える（これが「北沢から戻るとお店が減る」の原因だった）', () => {
  const items = [at('near-me', 0.002)]
  expect(retainNear(items, [far], 1500)).toEqual([])
  expect(retainNear(items, [far, me], 1500)).toHaveLength(1)
})

test('中心が null（まだ位置が無い）は無視する。中心が 1 つも無ければ全部残す', () => {
  const items = [at('a', 0.002), at('b', 0.2)]
  expect(retainNear(items, [null, me], 1500).map((x) => x.id)).toEqual(['a'])
  expect(retainNear(items, [null, null], 1500)).toHaveLength(2)
})
