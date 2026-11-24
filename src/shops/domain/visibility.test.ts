import { describe, expect, it } from 'vitest'
import { behindFog, modelPlace, visibleShops } from './visibility.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import { clearedFromHome } from '../../fog/domain/clearing.ts'
import type { Shop } from './shop.ts'
import { cellKey, cellOf } from '../../fog/domain/grid.ts'

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

  it('離れた場所を見ているとき（area）: そこの晴れた店は出る。霧の中の店は、見ている場所ではなく自分（me）の 50m 以内だけ（仕様 S1）', () => {
    const area = { lat: me.lat + 3000 * M, lng: me.lng }
    const there = (id: string, northM: number) => ({ ...shop(id, 0), lat: area.lat + northM * M })
    const cleared = new Set([cellKey(cellOf(there('clear', 50)))]) // 晴れは「clear」の店のマスだけ
    const r = visibleShops([there('clear', 50), there('fog', 600 /* 霧・見ている場所から 600m */), there('fogNearView', 30), shop('fogNearMe', 30)], area, cleared, me)
    expect(r.map((s) => s.id)).toContain('clear')
    expect(r.map((s) => s.id)).not.toContain('fog')
    expect(r.map((s) => s.id)).not.toContain('fogNearView') // 見ている場所の近くでも、霧の中の店はのぞけない
    expect(r.map((s) => s.id)).not.toContain('fogNearMe') // 自分の近くの霧の店でも、見ている場所から 1km より遠ければ出さない
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

describe('霧の向こうのお店（2026-11-24）', () => {
  const me = { lat: 35.65, lng: 139.63 }
  const far = { lat: 35.65 + 0.0018, lng: 139.63 } // 北へ約 200m
  const keysAlong = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const s = new Set<string>()
    for (let i = 0; i <= 100; i++) s.add(cellKey(cellOf({ lat: a.lat + (b.lat - a.lat) * (i / 100), lng: a.lng + (b.lng - a.lng) * (i / 100) })))
    return s
  }
  it('間がずっと晴れていれば、霧の向こうではない', () => {
    expect(behindFog(me, far, keysAlong(me, far))).toBe(false)
  })
  it('間に晴れていない所があれば、霧の向こう（お店は出さない）', () => {
    const c = keysAlong(me, far)
    c.delete(cellKey(cellOf({ lat: 35.65 + 0.0009, lng: 139.63 }))) // 真ん中のセルだけ霧
    expect(behindFog(me, far, c)).toBe(true)
  })
})
