import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FOOD, MAX_TILES, parseTiles, rowsFromPois } from './core.ts'

describe('parseTiles', () => {
  it('ズーム 14 の整数のタイルを 1〜9 枚。重複は 1 枚に', () => {
    expect(parseTiles({ tiles: [{ x: 14552, y: 6451 }, { x: 14553, y: 6451 }, { x: 14552, y: 6451 }] })).toEqual([{ x: 14552, y: 6451 }, { x: 14553, y: 6451 }])
  })
  it('形が違えば null', () => {
    const big = Array.from({ length: MAX_TILES + 1 }, (_, i) => ({ x: i, y: 0 }))
    for (const b of [null, {}, { tiles: [] }, { tiles: big }, { tiles: [{ x: 1.5, y: 0 }] }, { tiles: [{ x: -1, y: 0 }] }, { tiles: [{ x: 16384, y: 0 }] }, { tiles: [{ x: '1', y: 0 }] }, { tiles: 'x' }]) {
      expect(parseTiles(b)).toBeNull()
    }
  })
})

describe('rowsFromPois', () => {
  it('飲食店で名前と id がある点だけ、id の重複は 1 行', () => {
    const rows = rowsFromPois([
      { id: 1, name: 'たこ焼き まる', subclass: 'fast_food', lat: 35.6, lng: 139.6 },
      { id: 1, name: 'たこ焼き まる', subclass: 'fast_food', lat: 35.6, lng: 139.6 },
      { id: 2, name: '本屋', subclass: 'books', lat: 35.6, lng: 139.6 },
      { id: 3, name: '  ', subclass: 'cafe', lat: 35.6, lng: 139.6 },
      { id: undefined, name: '名無し', subclass: 'cafe', lat: 35.6, lng: 139.6 },
    ], '2026-11-12T00:00:00.000Z')
    expect(rows).toEqual([{ shop_id: 'osm:1', name: 'たこ焼き まる', lat: 35.6, lng: 139.6, genre_name: 'fast_food', fetched_at: '2026-11-12T00:00:00.000Z' }])
  })
})

describe('ほかと同じ一覧', () => {
  const foodLine = (path: string) => readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith('const FOOD = ') || l.startsWith('export const FOOD = '))?.replace(/^export /, '')
  it('FOOD は checkin と地図の画面と同じ', () => {
    expect(foodLine('supabase/functions/shops-osm/core.ts')).toBe(foodLine('supabase/functions/checkin/core.ts'))
    expect(foodLine('supabase/functions/shops-osm/core.ts')).toBe(foodLine('src/shops/infra/mapShops.ts'))
    expect(FOOD.has('restaurant')).toBe(true)
  })
})
