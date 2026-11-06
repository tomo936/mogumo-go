import { describe, expect, it } from 'vitest'
import { visibleShops } from './visibility.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
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
  details: null,
})

describe('visibleShops', () => {
  it('晴れの外の店は出ない', () => {
    const cleared = clearedFromHome(me)
    const r = visibleShops([shop('in', 50), shop('out', 500)], me, cleared)
    expect(r.map((s) => s.id)).toEqual(['in'])
  })

  it('霧の中でも 50m 以内の店は出る（40m は出る・60m は出ない）', () => {
    const cleared = new Set<string>() // 全部霧
    expect(visibleShops([shop('near', 40), shop('far', 60)], me, cleared).map((s) => s.id)).toEqual(['near'])
  })

  it('霧の中のちょうど 50m は出る', () => {
    // 1度ぶんの距離を distanceMeters で測り、そこから 50m ぶんの緯度差を出す（地球の半径の値に頼らない）
    const mPerDeg = distanceMeters(me, { lat: me.lat + 1, lng: me.lng })
    const edge = { ...shop('edge', 0), lat: me.lat + (50 - 1e-9) / mPerDeg } // 浮動小数の丸めで 50m を超えないよう 1e-9m だけ手前
    expect(distanceMeters(me, edge)).toBeLessThanOrEqual(50)
    expect(distanceMeters(me, edge)).toBeGreaterThan(49.999)
    expect(visibleShops([edge], me, new Set<string>()).map((s) => s.id)).toEqual(['edge'])
  })

  it('晴れた 900m の店は出る', () => {
    const s = shop('c', 900)
    const cleared = new Set(clearedFromHome({ lat: s.lat, lng: s.lng }))
    expect(visibleShops([s], me, cleared).map((x) => x.id)).toEqual(['c'])
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
