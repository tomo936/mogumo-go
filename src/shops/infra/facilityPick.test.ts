import { expect, test } from 'vitest'
import { localFrame } from '../../map/domain/geo.ts'
import { pickFacility } from './facilityPick.ts'
import type { PlacedFacility } from './facilityPick.ts'

// 1m = 2px の平らな投影（北が上、画面の原点は (139, 35)）
const f = localFrame({ lat: 35, lng: 139 })
const project = (p: { lat: number; lng: number }) => {
  const q = f.to(p)
  return { x: q.x * 2, y: -q.y * 2 }
}
const ring = (cx: number, cy: number, w: number, h: number) =>
  [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2], [cx - w / 2, cy - h / 2]].map(([x, y]) => f.back({ x, y }))
const fac: PlacedFacility = {
  id: 'fac:a', kind: 'facility', name: null, shopIds: ['a', 'b'], parts: [{ ring: ring(0, 0, 60, 40), heightM: 10 }], topM: 10, facingDeg: 180,
  door: f.back({ x: 0, y: -20 }),
}

test('輪郭の中を押すと当たり、外は null', () => {
  expect(pickFacility([fac], { x: 10, y: 10 }, project, () => 0)?.id).toBe('fac:a')
  expect(pickFacility([fac], { x: 200, y: 10 }, project, () => 0)).toBeNull()
})

test('屋根の高さの所（地面の輪郭より上）を押しても当たり', () => {
  // 輪郭の北の端は y=-40px。屋根が 30px 上なら y=-60px も当たり
  expect(pickFacility([fac], { x: 0, y: -60 }, project, () => 0)).toBeNull()
  expect(pickFacility([fac], { x: 0, y: -60 }, project, () => 30)?.id).toBe('fac:a')
})

test('屋根は部分ごとの高さで判定する（低い部分の上の高い所は外れ、高い部分の上は当たり）', () => {
  // 低い本体（高さ 2m、東西 60m × 南北 40m）と、北東の角の高い部分（高さ 20m、10m 四方）。1m 上がると 1px 上
  const two: PlacedFacility = { ...fac, parts: [{ ring: ring(0, 0, 60, 40), heightM: 2 }, { ring: ring(25, 15, 10, 10), heightM: 20 }] }
  const up = (_: PlacedFacility, h: number) => h
  // 北の端はどちらも y=-40px。低い所の 10px 上は外れ（本体の屋根は 2px 上まで）
  expect(pickFacility([two], { x: -40, y: -50 }, project, up)).toBeNull()
  // 高い部分の 10px 上は当たり（屋根は 20px 上まで）
  expect(pickFacility([two], { x: 50, y: -50 }, project, up)?.id).toBe('fac:a')
})
