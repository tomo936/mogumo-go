import { describe, expect, it } from 'vitest'
import { clearedFromHome } from '../../fog/domain/clearing.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { collectCandidates } from './candidates.ts'

const M = 1 / 111195
const home = { lat: 35, lng: 139 }
const at = (m: number) => ({ lat: 35 + m * M, lng: 139 }) // 自宅から北へ m
const shop = (id: string, m: number, o: Partial<Shop> = {}): Shop => ({ id, name: id, ...at(m), kind: 'ramen', details: null, mapId: null, ...o })
const none = new Set<string>()
const base = { cleared: clearedFromHome(home), checked: none, home, me: home, regen: false, random: () => 0.5 }

describe('collectCandidates', () => {
  it('自宅の範囲にいる → 自宅1kmの店だけ', () => {
    const shops = [shop('hp:a', 500), shop('hp:far', 1500)]
    expect(collectCandidates({ ...base, me: at(900), shops }).hp).toEqual(['hp:a'])
  })
  it('自宅の外にいる → 自宅1kmと今いる場所1kmの両方', () => {
    const shops = [shop('hp:home', 500), shop('hp:here', 3000), shop('hp:nowhere', 6000)]
    expect(collectCandidates({ ...base, me: at(3000), shops }).hp.sort()).toEqual(['hp:here', 'hp:home'])
  })
  it('作り直しは今いる場所1kmだけ', () => {
    const shops = [shop('hp:home', 500), shop('hp:here', 3000)]
    expect(collectCandidates({ ...base, me: at(3000), regen: true, shops }).hp).toEqual(['hp:here'])
  })
  it('自宅なしは今いる場所のまわりだけ', () => {
    const shops = [shop('hp:a', 500), shop('hp:b', 2000)]
    expect(collectCandidates({ ...base, home: null, shops }).hp).toEqual(['hp:a'])
  })
  it('晴れたセル・済み(id/mapId)・名前なしは外れる', () => {
    const shops = [
      shop('hp:cleared', 50),
      shop('hp:done', 500),
      shop('hp:viaMap', 600, { mapId: 'osm:9' }),
      shop('hp:noname', 700, { name: '' }),
      shop('hp:ok', 800),
    ]
    const checked = new Set(['hp:done', 'osm:9'])
    expect(collectCandidates({ ...base, checked, shops }).hp).toEqual(['hp:ok'])
  })
  it('チェーン名の店（ラーメン山岡家 中野店）は外れる。松屋は前方一致だけ', () => {
    const shops = [
      shop('hp:chain', 500, { name: 'ラーメン山岡家 中野店' }),
      shop('hp:matsuya', 510, { name: '松屋 新宿店' }),
      shop('hp:matsuya2', 520, { name: 'まつや食堂' }),
      shop('hp:ok', 530, { name: '麺屋もぐも' }),
    ]
    expect(collectCandidates({ ...base, shops }).hp).toEqual(['hp:matsuya2', 'hp:ok'])
  })
  it('同じ店名が3軒以上（範囲の外のぶんも数える）なら外れる。2軒なら残る', () => {
    const shops = [
      shop('hp:a1', 500, { name: '麺や太郎' }),
      shop('hp:a2', 510, { name: '麺や 太郎' }),
      shop('osm:a3', 5000, { name: '麺や太郎' }),
      shop('hp:b1', 520, { name: 'ひまわり亭' }),
      shop('hp:b2', 530, { name: 'ひまわり亭' }),
    ]
    expect(collectCandidates({ ...base, shops }).hp).toEqual(['hp:b1', 'hp:b2'])
  })
  it('hp は id だけ、osm で details なしは id と位置、osm で details ありは入らない', () => {
    const d = { genreCode: null, genreName: null, catch: null, budgetName: null, photoUrl: null, open: null }
    const shops = [shop('hp:a', 500), shop('osm:1', 600), shop('osm:2', 700, { details: d })]
    const r = collectCandidates({ ...base, shops })
    expect(r.hp).toEqual(['hp:a'])
    expect(r.osm).toEqual([{ id: 'osm:1', ...at(600) }])
  })
  it('hp 120件 → 100件、osm 60件 → 50件。同じ乱数なら同じ結果', () => {
    const shops = [
      ...Array.from({ length: 120 }, (_, i) => shop(`hp:${i}`, 300 + i)),
      ...Array.from({ length: 60 }, (_, i) => shop(`osm:${i}`, 300 + i)),
    ]
    const a = collectCandidates({ ...base, shops })
    const b = collectCandidates({ ...base, shops })
    expect(a.hp).toHaveLength(100)
    expect(a.osm).toHaveLength(50)
    expect(new Set(a.hp).size).toBe(100)
    expect(a).toEqual(b)
  })
})
