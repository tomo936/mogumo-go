// 図鑑の「？」のカードのヒント: どこから（今いる場所・無ければ自宅）見て、どの方角に何 m か（純粋な計算）。
// 名前は伏せたまま。晴れた場所のお店だけなので、場所を教えても S1（霧の中は見せない）は破らない。2026-11-13 オーナー
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { directionName } from '../../hints/domain/sheetText.ts'

export type HintOrigin = { pos: LatLng; from: 'here' | 'home' }

const FROM_LABEL = { here: 'ここから', home: '自宅から' } as const

export function whereText(origin: HintOrigin, to: LatLng): string {
  const dir = directionName(origin.pos, to)
  const from = FROM_LABEL[origin.from]
  if (!dir) return `${from} すぐ近く`
  const m = distanceMeters(origin.pos, to)
  const dist = m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(Math.round(m / 100) / 10).toFixed(1)}km`
  return `${from} ${dir}へ ${dist}`
}
