import { expect, test } from 'vitest'
import { groupShops } from './grouping.ts'

const at = (id: string, x: number, y: number) => ({ id, footprintCenter: { x, y } })

test('中心が 0.5m 以内の2軒は1組', () => {
  expect(groupShops([at('a', 0, 0), at('b', 0.3, 0.3)])).toEqual([['a', 'b']])
})

test('中心が 2m 離れていれば別の組', () => {
  expect(groupShops([at('a', 0, 0), at('b', 2, 0)])).toEqual([['a'], ['b']])
})

test('輪郭の外（null）は同じ点でも1軒ずつ', () => {
  expect(groupShops([{ id: 'a', footprintCenter: null }, { id: 'b', footprintCenter: null }])).toEqual([['a'], ['b']])
})

test('6軒でも1組、並びは入力の順', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  expect(groupShops(ids.map((id) => at(id, 5, 5)))).toEqual([ids])
})

test('組の位置は最初に出た店の順', () => {
  expect(groupShops([at('a', 0, 0), at('c', 30, 0), at('b', 0.2, 0)])).toEqual([['a', 'b'], ['c']])
})

// 速くした版が前の版（全部の組と比べる）と同じ結果か（2026-11-24 新宿でカクつく → お店の数の 2 乗だったのを近くだけ比べる形に）。
// さかいめぎりぎり（sameM ちょうど・少し内・少し外）の点と、輪郭の外の店を混ぜたでたらめなデータで突き合わせる
import { groupShops as groupFast } from './grouping.ts'
function groupRef(items: readonly { id: string; footprintCenter: { x: number; y: number } | null }[], sameM: number): string[][] {
  const groups: { center: { x: number; y: number } | null; ids: string[] }[] = []
  for (const { id, footprintCenter: c } of items) {
    const hit = c && groups.find((g) => g.center && Math.hypot(g.center.x - c.x, g.center.y - c.y) < sameM)
    if (hit) hit.ids.push(id)
    else groups.push({ center: c, ids: [id] })
  }
  return groups.map((g) => g.ids)
}
test('速くした組分けは、前の全部と比べるやり方と同じ組・同じ並びになる（さかいめの距離・輪郭の外を含む）', () => {
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (let trial = 0; trial < 200; trial++) {
    const sameM = 1 + rnd() * 6
    const items: { id: string; footprintCenter: { x: number; y: number } | null }[] = []
    const base: { x: number; y: number }[] = []
    const n = 1 + Math.floor(rnd() * 300)
    for (let i = 0; i < n; i++) {
      const r = rnd()
      let c: { x: number; y: number } | null
      if (r < 0.1) c = null
      else if (r < 0.5 && base.length) {
        // 前の点からちょうど sameM・少し内・少し外
        const b = base[Math.floor(rnd() * base.length)]
        const a = rnd() * Math.PI * 2
        const d = sameM * [1, 0.999999, 1.000001, 0.5, 2][Math.floor(rnd() * 5)]
        c = { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d }
      } else c = { x: (rnd() - 0.5) * 400, y: (rnd() - 0.5) * 400 }
      if (c) base.push(c)
      items.push({ id: `s${i}`, footprintCenter: c })
    }
    expect(groupFast(items, sameM)).toEqual(groupRef(items, sameM))
  }
})
