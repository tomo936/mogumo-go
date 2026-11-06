import { describe, expect, it } from 'vitest'
import { visibleShops } from './visibility.ts'
import { clearedFromHome } from '../../fog/domain/clearing.ts'
import type { Shop } from './shop.ts'

const me = { lat: 35, lng: 139 }
const M = 1 / 111_000 // 緯度1mぶんの度数（ほぼ）
const shop = (id: string, northM: number): Shop => ({
  id,
  name: id,
  lat: me.lat + northM * M,
  lng: me.lng,
  kind: 'cafe',
})

describe('visibleShops', () => {
  it('晴れの外の店は出ない', () => {
    const cleared = clearedFromHome(me)
    const r = visibleShops([shop('in', 50), shop('out', 500)], me, cleared)
    expect(r.map((s) => s.id)).toEqual(['in'])
  })

  it('1km より遠い店は出ない', () => {
    const cleared = new Set(clearedFromHome(me))
    const far = shop('far', 1200)
    for (const k of clearedFromHome({ lat: far.lat, lng: far.lng })) cleared.add(k)
    expect(visibleShops([far], me, cleared)).toEqual([])
  })

  it('50軒の晴れた店から近い順に40軒', () => {
    const cleared = clearedFromHome(me)
    const shops = Array.from({ length: 50 }, (_, i) => shop(`s${i}`, 150 - i * 3)).reverse()
    const r = visibleShops(shops, me, cleared)
    expect(r).toHaveLength(40)
    expect(r[0].id).toBe('s49')
    expect(shops).toHaveLength(50)
  })

  it('空配列で空', () => {
    expect(visibleShops([], me, clearedFromHome(me))).toEqual([])
  })
})
