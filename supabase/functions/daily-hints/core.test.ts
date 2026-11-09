import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeName as clientNormalizeName } from '../../../src/shops/domain/merge.ts'
import * as checkin from '../checkin/core.ts'
import {
  HINT_COUNT, HINT_MAX_HP_CANDIDATES, HINT_MAX_OSM_CANDIDATES, budgetShort, catchFragment, centroid, composeDraw, distanceM, farEnough,
  findPoi, hintRow, jstDay, namesMatch, normalizeName, parseRequest, planDraw, shuffle, tilesToTry, toResponse,
} from './core.ts'
import type { HintRowOut, PoiFeature, ShopLite } from './core.ts'

describe('checkin と同じ部品', () => {
  // パスはリポジトリの根（vitest の実行場所）から
  it('osmTile.ts は checkin と daily-hints で同じ中身', () => {
    const a = readFileSync('supabase/functions/checkin/osmTile.ts', 'utf8')
    const b = readFileSync('supabase/functions/daily-hints/osmTile.ts', 'utf8')
    expect(b).toBe(a)
  })

  it('写した関数は checkin/core.ts と同じ答え', () => {
    const now = new Date('2026-11-07T15:00:00Z')
    expect(jstDay(now)).toBe('2026-11-08')
    expect(checkin.jstDay(now)).toBe('2026-11-08')
    expect(tilesToTry(35.68, 139.76, 14, 60)).toEqual(checkin.tilesToTry(35.68, 139.76, 14, 60))
    const a = { lat: 35.6909, lng: 139.7003 }
    const b = { lat: 35.7, lng: 139.71 }
    expect(distanceM(a, b)).toEqual(checkin.distanceM(a, b))
    const features: PoiFeature[] = [
      { id: 41, name: 'ちがう店', subclass: 'cafe', lng: 139.7, lat: 35.69 },
      { id: 42, name: '麺屋もぐも', subclass: 'restaurant', lng: 139.7, lat: 35.69 },
    ]
    expect(findPoi(features, 'osm:42')).toEqual(checkin.findPoi(features, 'osm:42'))
    expect(findPoi(features, 'osm:42')?.name).toBe('麺屋もぐも')
  })

  it('normalizeName は src/shops/domain/merge.ts と同じ答え', () => {
    for (const n of ['ラーメン 一郎 本店', 'カフェ「ことり」', 'すし処(駅前)']) {
      expect(normalizeName(n)).toBe(clientNormalizeName(n))
      expect(checkin.normalizeName(n)).toBe(clientNormalizeName(n))
    }
  })

  it('namesMatch は ならした名前が互いを含むとき true', () => {
    expect(namesMatch('一郎', 'ラーメン一郎 新宿店')).toBe(true)
    expect(namesMatch('一郎', '二郎')).toBe(false)
    expect(namesMatch('', 'x')).toBe(false)
    expect(checkin.namesMatch('一郎', 'ラーメン一郎 新宿店')).toBe(true)
    expect(checkin.namesMatch('', 'x')).toBe(false)
  })
})

const seq = (...v: number[]) => () => v.shift() ?? 0

describe('parseRequest', () => {
  const ok = { regen: false, hp: ['hp:J001', 'hp:J002'], osm: [{ id: 'osm:12', lat: 35.6, lng: 139.6 }] }
  it('正しい形が通る', () => {
    expect(parseRequest(ok)).toEqual(ok)
  })
  it('形が違う・上限超え・id の形が違う・位置が数でない → null', () => {
    expect(parseRequest(null)).toBeNull()
    expect(parseRequest({ ...ok, regen: 'false' })).toBeNull()
    expect(parseRequest({ ...ok, hp: 'hp:J001' })).toBeNull()
    expect(parseRequest({ ...ok, osm: null })).toBeNull()
    expect(parseRequest({ ...ok, hp: ['hp:abc-1'] })).toBeNull()
    expect(parseRequest({ ...ok, osm: [{ id: 'osm:12a', lat: 35.6, lng: 139.6 }] })).toBeNull()
    expect(parseRequest({ ...ok, hp: Array.from({ length: 101 }, (_, i) => `hp:J${i}`) })).toBeNull()
    expect(parseRequest({ ...ok, osm: Array.from({ length: 51 }, (_, i) => ({ id: `osm:${i}`, lat: 35.6, lng: 139.6 })) })).toBeNull()
    expect(parseRequest({ ...ok, osm: [{ id: 'osm:12', lat: NaN, lng: 139.6 }] })).toBeNull()
  })
  it('上限ちょうどは通る', () => {
    expect(parseRequest({ ...ok, hp: Array.from({ length: HINT_MAX_HP_CANDIDATES }, (_, i) => `hp:J${i}`) })).not.toBeNull()
    expect(parseRequest({ ...ok, osm: Array.from({ length: HINT_MAX_OSM_CANDIDATES }, (_, i) => ({ id: `osm:${i}`, lat: 35.6, lng: 139.6 })) })).not.toBeNull()
  })
  it('余分な項目（home など）は無視して、結果に入れない', () => {
    const r = parseRequest({ ...ok, home: { lat: 1, lng: 2 }, lat: 35, lng: 139 })
    expect(r).toEqual(ok)
    expect(Object.keys(r ?? {}).sort()).toEqual(['hp', 'osm', 'regen'])
  })
  it('重複した id は1つにする', () => {
    const r = parseRequest({ regen: true, hp: ['hp:A', 'hp:A'], osm: [{ id: 'osm:1', lat: 35, lng: 139 }, { id: 'osm:1', lat: 35, lng: 139 }] })
    expect(r).toEqual({ regen: true, hp: ['hp:A'], osm: [{ id: 'osm:1', lat: 35, lng: 139 }] })
  })
})

describe('planDraw', () => {
  it('謎の日・ふつうの日・候補が足りない日', () => {
    expect(planDraw(10, 10, seq(0.1))).toEqual({ hp: 2, osm: 1 })
    expect(planDraw(10, 10, seq(0.9))).toEqual({ hp: 3, osm: 0 })
    expect(planDraw(1, 10, seq(0.9))).toEqual({ hp: 1, osm: 2 })
    expect(planDraw(10, 0, seq(0.1))).toEqual({ hp: 3, osm: 0 })
    expect(planDraw(2, 0, seq(0.5))).toEqual({ hp: 2, osm: 0 })
    expect(planDraw(0, 0, seq(0.1))).toEqual({ hp: 0, osm: 0 })
  })
  it('乱数は1回だけ使う', () => {
    let n = 0
    planDraw(10, 10, () => { n++; return 0.5 })
    expect(n).toBe(1)
  })
})

describe('composeDraw', () => {
  const hp = ['hp:A', 'hp:B', 'hp:C', 'hp:D']
  it('謎1件が確かめられた → hp 2＋osm 1', () => {
    expect(composeDraw({ hp, wantHp: 2, osmOk: ['osm:1'], wantOsm: 1 })).toEqual(['hp:A', 'hp:B', 'osm:1'])
  })
  it('確かめられなかった → hp で埋めて3件', () => {
    expect(composeDraw({ hp, wantHp: 2, osmOk: [], wantOsm: 1 })).toEqual(['hp:A', 'hp:B', 'hp:C'])
  })
  it('hp も足りなければあるだけ', () => {
    expect(composeDraw({ hp: ['hp:A'], wantHp: 1, osmOk: [], wantOsm: 2 })).toEqual(['hp:A'])
  })
  it('重複が無く、3件まで', () => {
    const r = composeDraw({ hp, wantHp: 3, osmOk: ['osm:1', 'osm:2'], wantOsm: 2 })
    expect(r.length).toBe(HINT_COUNT)
    expect(new Set(r).size).toBe(r.length)
  })
})

describe('shuffle', () => {
  it('同じ乱数なら同じ順、元の配列は変わらない', () => {
    const xs = [1, 2, 3, 4, 5]
    const a = shuffle(xs, seq(0.1, 0.7, 0.3, 0.9))
    const b = shuffle(xs, seq(0.1, 0.7, 0.3, 0.9))
    expect(a).toEqual(b)
    expect(xs).toEqual([1, 2, 3, 4, 5])
    expect([...a].sort()).toEqual(xs)
  })
})

describe('farEnough', () => {
  const mPerDeg = (6371008.8 * Math.PI) / 180
  const o = { lat: 35.6, lng: 139.6 }
  const north = (m: number) => ({ lat: o.lat + m / mPerDeg, lng: o.lng })
  it('重心どうしが 1500m ちょうどなら true、1499m なら false', () => {
    const prev = [north(-10), north(10)] // 重心は o
    expect(farEnough(prev, [north(1500)])).toBe(true)
    expect(farEnough(prev, [north(1499)])).toBe(false)
  })
  it('どちらかが空なら false', () => {
    expect(farEnough([], [north(5000)])).toBe(false)
    expect(farEnough([o], [])).toBe(false)
  })
  it('centroid は平均', () => {
    expect(centroid([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }])).toEqual({ lat: 2, lng: 3 })
  })
})

describe('catchFragment', () => {
  it('かっこを消して最初の切れ端', () => {
    expect(catchFragment('【駅徒歩3分】自家製麺の濃厚つけ麺！', 'つけ麺屋')).toBe('自家製麺の濃厚つけ麺')
  })
  it('店名を含む切れ端は外す', () => {
    expect(catchFragment('麺屋こころの絶品ラーメン♪こだわりスープ', '麺屋こころ')).toBe('こだわりスープ')
  })
  it('駅・徒歩を含む切れ端は外す', () => {
    expect(catchFragment('渋谷駅すぐ！夜景が自慢', 'バー')).toBe('夜景が自慢')
  })
  it('3文字以下しか無ければ null', () => {
    expect(catchFragment('旨い！', 'x')).toBeNull()
  })
  it('15文字以上は先頭14文字＋…', () => {
    expect(catchFragment('あいうえおかきくけこさしすせそ', 'x')).toBe('あいうえおかきくけこさしすせ…')
    expect(catchFragment('あいうえおかきくけこさしすせ', 'x')).toBe('あいうえおかきくけこさしすせ')
  })
  it('null → null', () => {
    expect(catchFragment(null, 'x')).toBeNull()
  })
})

describe('budgetShort', () => {
  it('下の端の金額で短く言いかえる', () => {
    expect(budgetShort('～500円')).toBe('〜1,000円')
    expect(budgetShort('501～1000円')).toBe('〜1,000円')
    expect(budgetShort('1001～1500円')).toBe('1,000円台')
    expect(budgetShort('2001～3000円')).toBe('2,000円台')
    expect(budgetShort('5001～7000円')).toBe('5,000円台')
    expect(budgetShort('10001～15000円')).toBe('1万円台')
    expect(budgetShort('30001円～')).toBe('3万円台')
  })
  it('全角・カンマ・波線の違いをならす', () => {
    expect(budgetShort('１，００１〜１，５００円')).toBe('1,000円台')
    expect(budgetShort('1,001~1,500円')).toBe('1,000円台')
  })
  it('読めない書き方はそのまま、無ければ null', () => {
    expect(budgetShort('お問い合わせください')).toBe('お問い合わせください')
    expect(budgetShort(null)).toBeNull()
    expect(budgetShort('')).toBeNull()
  })
})

describe('hintRow', () => {
  const shop: ShopLite = { shop_id: 'hp:A', name: '麺屋こころ', lat: 35, lng: 139, genre_name: 'ラーメン', catch: '自家製麺の濃厚つけ麺！', budget_name: '1001～1500円' }
  it('hp の店はジャンル名そのまま・断片・予算', () => {
    expect(hintRow(shop, 2, false)).toEqual({ slot: 2, shop_id: 'hp:A', hint_genre: 'ラーメン', hint_catch: '自家製麺の濃厚つけ麺', hint_budget: '1,000円台', is_mystery: false })
  })
  it('ジャンル無しは null で謎ではない', () => {
    expect(hintRow({ ...shop, genre_name: null }, 1, false).hint_genre).toBeNull()
    expect(hintRow({ ...shop, genre_name: null }, 1, false).is_mystery).toBe(false)
  })
  it('謎なら3つとも null', () => {
    expect(hintRow({ ...shop, shop_id: 'osm:1' }, 3, true)).toEqual({ slot: 3, shop_id: 'osm:1', hint_genre: null, hint_catch: null, hint_budget: null, is_mystery: true })
  })
})

describe('toResponse', () => {
  const row = (slot: number, shop_id: string, generation: number, done: string | null = null): HintRowOut => ({
    hint_id: `h${generation}-${slot}`, slot, shop_id, generation, hint_genre: null, hint_catch: null, hint_budget: null, is_mystery: false, completed_checkin_id: done,
  })
  const shops = new Map([
    ['hp:A', { name: 'A店', lat: 35, lng: 139 }],
    ['hp:B', { name: 'B店', lat: 35.1, lng: 139.1 }],
  ])
  it('generation 1 → regen_left 1、slot 順、店の名前と位置が付く', () => {
    const r = toResponse('2026-11-07', [row(2, 'hp:B', 1, 'c1'), row(1, 'hp:A', 1)], shops)
    expect(r.hint_date).toBe('2026-11-07')
    expect(r.generation).toBe(1)
    expect(r.regen_left).toBe(1)
    expect(r.hints).toEqual([
      { hint_id: 'h1-1', slot: 1, shop_id: 'hp:A', hint_genre: null, hint_catch: null, hint_budget: null, is_mystery: false, completed: false, shop: { name: 'A店', lat: 35, lng: 139 } },
      { hint_id: 'h1-2', slot: 2, shop_id: 'hp:B', hint_genre: null, hint_catch: null, hint_budget: null, is_mystery: false, completed: true, shop: { name: 'B店', lat: 35.1, lng: 139.1 } },
    ])
  })
  it('generation 2 → regen_left 0', () => {
    expect(toResponse('2026-11-07', [row(1, 'hp:A', 2)], shops).regen_left).toBe(0)
  })
  it('行が無ければ generation 0・hints 空', () => {
    expect(toResponse('2026-11-07', [], shops)).toEqual({ hint_date: '2026-11-07', generation: 0, regen_left: 0, hints: [] })
  })
})
