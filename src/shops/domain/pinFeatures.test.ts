import { expect, test } from 'vitest'
import { pinFeatures } from './pinFeatures.ts'

const M = 111195
const me = { lat: 35, lng: 139 }
const at = (id: string, northM: number, model = 'ramen') => ({ id, model, lat: me.lat + northM / M, lng: me.lng })

test('店ごとに地物を作り、種類・霧の中か・座標を持たせる', () => {
  const [f] = pinFeatures([at('a', 10, 'cafe')], new Set(['a']), me)
  expect(f.geometry).toEqual({ type: 'Point', coordinates: [me.lng, me.lat + 10 / M] })
  expect(f.properties).toMatchObject({ id: 'a', kind: 'cafe', fog: true })
})

test('霧の外の店は fog が false', () => {
  expect(pinFeatures([at('a', 10)], new Set(), me)[0].properties.fog).toBe(false)
})

test('近い店ほど sort が小さい（重なったとき近い店が残る）', () => {
  const [far, near] = pinFeatures([at('far', 80), at('near', 5)], new Set(), me)
  expect(near.properties.sort).toBeLessThan(far.properties.sort)
})

test('空なら空', () => {
  expect(pinFeatures([], new Set(), me)).toEqual([])
})

test('済みの店は done が true（既定は false）', () => {
  expect(pinFeatures([at('a', 10)], new Set(), me)[0].properties.done).toBe(false)
  const [a, b] = pinFeatures([at('a', 10), at('b', 20)], new Set(), me, new Set(['b']))
  expect([a.properties.done, b.properties.done]).toEqual([false, true])
})
