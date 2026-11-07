import { describe, expect, it } from 'vitest'
import { modelPlace, visibleShops } from './visibility.ts'
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
  mapId: null,
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

  it('500軒の晴れた店は上限なく全部、近い順で返る', () => {
    const cleared = clearedFromHome(me)
    const shops = Array.from({ length: 500 }, (_, i) => shop(`s${i}`, 150 - i * 0.25)).reverse()
    const r = visibleShops(shops, me, cleared)
    expect(r).toHaveLength(500)
    expect(r[0].id).toBe('s499')
    expect(r[499].id).toBe('s0')
    expect(shops).toHaveLength(500)
  })

  it('空配列で空', () => {
    expect(visibleShops([], me, clearedFromHome(me))).toEqual([])
  })
})

describe('modelPlace（模型をどの層に出すか）', () => {
  const home = clearedFromHome(me) // 自宅（me）から 200m が晴れ
  const at = (northM: number) => ({ lat: me.lat + northM * M, lng: me.lng })

  it('店の点も模型の中心も晴れたセルなら clear', () => {
    expect(modelPlace(at(100), [at(100)], me, home)).toBe('clear')
  })

  it('店の点は晴れでも、模型の中心が霧のセルなら出さない', () => {
    expect(modelPlace(at(240), [at(190)], me, home)).toBeNull()
  })

  it('霧の中で 50m 以内の店は fog（雲の上に描く）', () => {
    expect(modelPlace(at(45), [at(40)], me, new Set<string>())).toBe('fog')
  })

  it('霧の中の近い店は、模型の中心が霧でも fog', () => {
    expect(modelPlace(at(60), [at(40)], me, new Set<string>())).toBe('fog')
  })

  it('ビルは誰か1軒が霧の中の近い店なら fog', () => {
    // 自分は 10m 北。1軒は 20m 先（霧の中の近い店）、もう1軒は 200m 先
    expect(modelPlace(at(30), [at(30), at(210)], at(10), new Set<string>())).toBe('fog')
  })
})
