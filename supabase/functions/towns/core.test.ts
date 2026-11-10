import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as checkin from '../checkin/core.ts'
import {
  bboxOf, chunkKey, chunkKeysForGeometry, distanceM, findTown, foodInTown, inGeometry, judge, mergeShops, namesMatch, needsCount,
  normalizeName, progress, tileBounds, tilesForGeometry, tileXY,
} from './core.ts'
import type { ChunkTown, Geometry, PoiFeature, TownShop } from './core.ts'

// 四角（経度・緯度の順）。穴は holes に
const ring = (minLng: number, minLat: number, maxLng: number, maxLat: number): number[][] => [
  [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat],
]
const square = (minLng: number, minLat: number, maxLng: number, maxLat: number, ...holes: number[][][]): Geometry => ({
  type: 'Polygon',
  coordinates: [ring(minLng, minLat, maxLng, maxLat), ...holes],
})
const multi = (...parts: Geometry[]): Geometry => ({
  type: 'MultiPolygon',
  coordinates: parts.map((p) => (p.type === 'Polygon' ? p.coordinates : p.coordinates[0])),
})

describe('checkin と同じ部品', () => {
  // パスはリポジトリの根（vitest の実行場所）から
  const a = readFileSync('supabase/functions/checkin/core.ts', 'utf8')
  const b = readFileSync('supabase/functions/towns/core.ts', 'utf8')
  const pick = (src: string, re: RegExp) => {
    const m = re.exec(src)
    if (!m) throw new Error(`見つからない: ${re}`)
    return m[0]
  }

  it('FOOD・normalizeName・namesMatch は checkin/core.ts と同じ文字列', () => {
    for (const re of [/const FOOD = new Set\(\[.*\]\)/, /export function normalizeName[\s\S]*?\n}\n/, /export function namesMatch[\s\S]*?\n}\n/]) {
      expect(pick(b, re)).toBe(pick(a, re))
    }
  })

  it('MATCH_M・distanceM・tileXY は同じ答え', () => {
    expect(pick(b, /export const MATCH_M = \d+/)).toBe(pick(a, /export const MATCH_M = \d+/))
    const p = { lat: 35.6909, lng: 139.7003 }
    const q = { lat: 35.7, lng: 139.71 }
    expect(distanceM(p, q)).toEqual(checkin.distanceM(p, q))
    expect(tileXY(35.64, 139.63, 14)).toEqual(checkin.tileXY(35.64, 139.63, 14))
    expect(normalizeName('ラーメン 一郎 本店')).toBe(checkin.normalizeName('ラーメン 一郎 本店'))
    expect(namesMatch('一郎', 'ラーメン一郎 新宿店')).toBe(true)
  })
})

describe('格子', () => {
  it('chunkKey は 0.25度の格子', () => {
    expect(chunkKey(35.64, 139.63)).toBe('558_142')
    expect(chunkKey(35.75, 139.75)).toBe('559_143')
  })

  it('bboxOf は 外側の四角', () => {
    expect(bboxOf(multi(square(139.1, 35.1, 139.2, 35.2), square(142.1, 34.9, 142.2, 35.0)))).toEqual([139.1, 34.9, 142.2, 35.2])
  })

  it('chunkKeysForGeometry は 部品ごと（離れた島のあいだの格子を含まない）', () => {
    const g = multi(square(139.1, 35.1, 139.11, 35.11), square(142.1, 35.1, 142.11, 35.11))
    expect(chunkKeysForGeometry(g).sort()).toEqual(['556_140', '568_140'])
  })

  it('格子の境をまたぐ形は 両方の格子に入る', () => {
    expect(chunkKeysForGeometry(square(139.24, 35.1, 139.26, 35.11)).sort()).toEqual(['556_140', '557_140'])
  })
})

describe('形の中か', () => {
  const g = square(139.0, 35.0, 139.1, 35.1, ring(139.04, 35.04, 139.06, 35.06))
  it('中は true・外は false・穴の中は false', () => {
    expect(inGeometry(g, 35.02, 139.02)).toBe(true)
    expect(inGeometry(g, 35.2, 139.02)).toBe(false)
    expect(inGeometry(g, 35.05, 139.05)).toBe(false)
  })
  it('MultiPolygon はどれかの部品の中なら true', () => {
    const m = multi(square(139.0, 35.0, 139.1, 35.1), square(140.0, 35.0, 140.1, 35.1))
    expect(inGeometry(m, 35.05, 140.05)).toBe(true)
    expect(inGeometry(m, 35.05, 139.5)).toBe(false)
  })
})

describe('findTown', () => {
  const town = (id: string, area: number, geom: Geometry): ChunkTown => ({ id, name: id, city: '市', area, bbox: bboxOf(geom), geom })
  const big = town('big', 100, square(139.0, 35.0, 139.2, 35.2))
  const small = town('small', 10, square(139.05, 35.05, 139.1, 35.1))
  it('重なれば 小さい方', () => {
    expect(findTown([big, small], 35.07, 139.07)?.id).toBe('small')
    expect(findTown([small, big], 35.07, 139.07)?.id).toBe('small')
    expect(findTown([big, small], 35.15, 139.15)?.id).toBe('big')
  })
  it('どれにも無ければ null', () => {
    expect(findTown([big, small], 36, 139.07)).toBeNull()
    expect(findTown([], 35.07, 139.07)).toBeNull()
  })
})

describe('tilesForGeometry', () => {
  const Z = 14
  const t = tileXY(35.64, 139.63, Z)
  const center = (x: number, y: number) => {
    const [w, s, e, n] = tileBounds(x, y, Z)
    return { lng: (w + e) / 2, lat: (s + n) / 2 }
  }
  const dot = (x: number, y: number) => {
    const c = center(x, y)
    return square(c.lng - 0.001, c.lat - 0.001, c.lng + 0.001, c.lat + 0.001)
  }

  it('tileBounds は そのタイルの四角（中の点は同じタイル）', () => {
    const c = center(t.x, t.y)
    expect(tileXY(c.lat, c.lng, Z)).toEqual(t)
  })

  it('1タイルの中の小さい四角 → 1枚', () => {
    expect(tilesForGeometry(dot(t.x, t.y), Z)).toEqual([[t.x, t.y]])
  })

  it('L 字（外側の四角は 2×2、右上には触れない）→ 3枚', () => {
    const a = center(t.x, t.y) // 左上
    const b = center(t.x + 1, t.y + 1) // 右下
    const d = 0.001
    const l: Geometry = {
      type: 'Polygon',
      coordinates: [[
        [a.lng - d, a.lat + d], [a.lng + d, a.lat + d], [a.lng + d, b.lat + d], [b.lng + d, b.lat + d],
        [b.lng + d, b.lat - d], [a.lng - d, b.lat - d], [a.lng - d, a.lat + d],
      ]],
    }
    expect(tilesForGeometry(l, Z)).toEqual([[t.x, t.y], [t.x, t.y + 1], [t.x + 1, t.y + 1]])
  })

  it('輪郭が通らない真ん中のタイルも入る（3×3）', () => {
    const a = center(t.x, t.y)
    const b = center(t.x + 2, t.y + 2)
    const tiles = tilesForGeometry(square(a.lng, b.lat, b.lng, a.lat), Z)
    expect(tiles).toHaveLength(9)
    expect(tiles).toContainEqual([t.x + 1, t.y + 1])
    expect(tiles[0]).toEqual([t.x, t.y])
    expect(tiles[8]).toEqual([t.x + 2, t.y + 2])
  })

  it('離れた2部品 → あいだのタイルを含まない', () => {
    expect(tilesForGeometry(multi(dot(t.x, t.y), dot(t.x + 5, t.y)), Z)).toEqual([[t.x, t.y], [t.x + 5, t.y]])
  })

  it('穴の中に丸ごと入るタイルは含まない', () => {
    const a = center(t.x, t.y)
    const b = center(t.x + 2, t.y + 2)
    const [w, s, e, n] = tileBounds(t.x + 1, t.y + 1, Z)
    const g = square(a.lng, b.lat, b.lng, a.lat, ring(w - 0.001, s - 0.001, e + 0.001, n + 0.001))
    const tiles = tilesForGeometry(g, Z)
    expect(tiles).toHaveLength(8)
    expect(tiles).not.toContainEqual([t.x + 1, t.y + 1])
  })
})

describe('foodInTown', () => {
  const g = square(139.0, 35.0, 139.1, 35.1)
  const features: PoiFeature[] = [
    { id: 12, name: '麺屋もぐも', subclass: 'restaurant', lng: 139.05, lat: 35.05 },
    { id: 13, name: 'ぎんこう', subclass: 'bank', lng: 139.05, lat: 35.05 },
    { id: 14, subclass: 'cafe', lng: 139.05, lat: 35.05 },
    { id: 15, name: '  ', subclass: 'cafe', lng: 139.05, lat: 35.05 },
    { id: 16, name: 'そとのカフェ', subclass: 'cafe', lng: 139.5, lat: 35.05 },
    { name: '番号なし', subclass: 'cafe', lng: 139.05, lat: 35.05 },
  ]
  it('名前のある飲食店で 形の中の点だけ', () => {
    expect(foodInTown(features, g)).toEqual([{ id: 'osm:12', name: '麺屋もぐも', lat: 35.05, lng: 139.05 }])
  })
})

describe('mergeShops', () => {
  it('id で重複なし（先のものを残す）', () => {
    const a: TownShop[] = [{ id: 'osm:1', name: 'A', lat: 35, lng: 139 }]
    const b: TownShop[] = [{ id: 'osm:1', name: 'A2', lat: 35, lng: 139 }, { id: 'osm:2', name: 'B', lat: 35, lng: 139 }]
    expect(mergeShops(a, b)).toEqual([a[0], b[1]])
  })
})

describe('progress', () => {
  // 緯度 0.001度 ≒ 111m
  const list: TownShop[] = [
    { id: 'osm:1', name: 'カフェことり', lat: 35.0, lng: 139.0 },
    { id: 'osm:2', name: 'ラーメン花 経堂店', lat: 35.001, lng: 139.0 },
    { id: 'osm:3', name: 'すし松', lat: 35.002, lng: 139.0 },
    { id: 'osm:4', name: 'パン工房', lat: 35.003, lng: 139.0 },
  ]
  const v1: TownShop = { id: 'osm:1', name: 'カフェことり', lat: 35.0, lng: 139.0 }
  const hpA: TownShop = { id: 'hp:A', name: 'らーめん花', lat: 35.00118, lng: 139.0 } // osm:2 から約 20m
  const v2: TownShop = { id: 'osm:2', name: 'ラーメン花 経堂店', lat: 35.001, lng: 139.0 }
  const hpB: TownShop = { id: 'hp:B', name: '一覧に無い店', lat: 35.0045, lng: 139.0 }

  it('何も行っていない', () => {
    expect(progress(list, [])).toEqual({ visited: 0, total: 4 })
  })
  it('番号が同じ店と、40m 以内で名前が互いを含む店', () => {
    expect(progress(list, [v1, hpA])).toEqual({ visited: 2, total: 4 })
  })
  it('同じ店を hp: と osm: の両方で行っても 1 と数える', () => {
    expect(progress(list, [v1, hpA, v2])).toEqual({ visited: 2, total: 4 })
    expect(progress(list, [v2, hpA, v1])).toEqual({ visited: 2, total: 4 })
  })
  it('一覧に無い店は 分子と分母の両方に足す', () => {
    expect(progress(list, [v1, hpA, hpB])).toEqual({ visited: 3, total: 5 })
    expect(progress([], [hpB])).toEqual({ visited: 1, total: 1 })
  })
  it('一覧に無い同じ店を hp: と osm: で行っても 1 と数える', () => {
    const osmB: TownShop = { id: 'osm:99', name: '一覧に無い店 本店', lat: 35.0045, lng: 139.0001 }
    expect(progress(list, [hpB, osmB])).toEqual({ visited: 1, total: 5 })
  })
  it('名前が合っても 40m より遠ければ別の店', () => {
    const far: TownShop = { id: 'hp:C', name: 'らーめん花', lat: 35.0016, lng: 139.0 } // osm:2 から約 67m
    expect(progress(list, [far])).toEqual({ visited: 1, total: 5 })
  })
})

describe('judge', () => {
  it('クリアは 半分（切り上げ）以上、コンプリートは 全部', () => {
    expect(judge({ visited: 1, total: 2 })).toEqual({ clear: true, complete: false })
    expect(judge({ visited: 1, total: 3 })).toEqual({ clear: false, complete: false })
    expect(judge({ visited: 2, total: 3 })).toEqual({ clear: true, complete: false })
    expect(judge({ visited: 3, total: 3 })).toEqual({ clear: true, complete: true })
    expect(judge({ visited: 0, total: 0 })).toEqual({ clear: false, complete: false })
    expect(judge({ visited: 1, total: 1 })).toEqual({ clear: true, complete: true })
  })
})

describe('needsCount', () => {
  const now = new Date('2026-11-10T00:00:00Z')
  it('まだ数えていない・30日より古い → true', () => {
    expect(needsCount(null, now)).toBe(true)
    expect(needsCount('2026-10-12T00:00:00Z', now)).toBe(false) // 29日前
    expect(needsCount('2026-10-10T00:00:00Z', now)).toBe(true) // 31日前
  })
})
