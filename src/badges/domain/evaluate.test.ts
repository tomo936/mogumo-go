import { describe, expect, test } from 'vitest'
import type { ShopKind } from '../../shops/domain/shop.ts'
import { evaluate, recentEarned, remaining, seriesOf } from './evaluate.ts'
import type { BadgeInput, BadgeState, BadgeVisit } from './types.ts'

// 日本時間の日時（'2026-11-06 12:10'）
const jst = (s: string) => Date.parse(`${s.replace(' ', 'T')}:00+09:00`)
let n = 0
const v = (kind: ShopKind, when: string, o: Partial<BadgeVisit> = {}): BadgeVisit => ({
  shopId: `s${n++}`, kind, at: jst(when), lat: 35.65, lng: 139.63, wasHint: false, mysteryHint: false, ...o,
})
const input = (visits: BadgeVisit[], o: Partial<BadgeInput> = {}): BadgeInput => ({ visits, cellTimes: [], home: null, ...o })
const get = (states: BadgeState[], id: string) => {
  const s = states.find((x) => x.def.id === id)
  if (!s) throw new Error(id)
  return s
}

describe('ジャンル', () => {
  test('ラーメン3回で★1と★2、★3は have 3 / need 10（あと 7回）', () => {
    const s = evaluate(input([v('ramen', '2026-11-01 12:00'), v('ramen', '2026-11-02 12:00'), v('ramen', '2026-11-03 12:00')]))
    expect(get(s, 'genre_ramen_1').earnedAt).toBe(jst('2026-11-01 12:00'))
    expect(get(s, 'genre_ramen_2').earnedAt).toBe(jst('2026-11-03 12:00'))
    const third = get(s, 'genre_ramen_3')
    expect(third).toMatchObject({ earnedAt: null, have: 3 })
    expect(third.def).toMatchObject({ name: 'ラーメン通', stars: 3, need: 10 })
    expect(remaining(third)).toBe('あと 7回')
  })
  test('その他（mystery）は「なぞ」', () => {
    const s = evaluate(input([]))
    expect(get(s, 'genre_mystery_5').def.name).toBe('なぞマスター')
  })
})

test('はしご上手は日本時間の同じ日の3軒（23:50 と翌 0:10 は別の日）', () => {
  const a = evaluate(input([v('ramen', '2026-11-05 22:00'), v('cafe', '2026-11-05 23:50'), v('sushi', '2026-11-06 00:10')]))
  expect(get(a, 'hashigo_3').earnedAt).toBeNull()
  expect(get(a, 'hashigo_2').earnedAt).toBe(jst('2026-11-05 23:50'))
  const b = evaluate(input([v('ramen', '2026-11-05 12:00'), v('cafe', '2026-11-05 15:00'), v('sushi', '2026-11-05 23:50')]))
  expect(get(b, 'hashigo_3').earnedAt).toBe(jst('2026-11-05 23:50'))
})

test('毎日グルメ: 7日つづけた日に取れる、1日空くと数え直し', () => {
  const days = ['01', '02', '03', '05', '06', '07', '08', '09', '10', '11'].map((d) => v('ramen', `2026-11-${d} 12:00`))
  const s = evaluate(input(days))
  expect(get(s, 'rhythm_7').earnedAt).toBe(jst('2026-11-11 12:00'))
  expect(get(s, 'rhythm_3').earnedAt).toBe(jst('2026-11-03 12:00'))
})

test('霧はらい: マスの時刻の 1600 番目で 1km²', () => {
  const cellTimes = Array.from({ length: 1700 }, (_, i) => i * 1000)
  const s = evaluate(input([], { cellTimes }))
  expect(get(s, 'fog_1').earnedAt).toBe(1599 * 1000)
  expect(get(s, 'fog_5')).toMatchObject({ earnedAt: null, have: 1.06 })
})

test('自宅が無ければ遠征は取れず have null', () => {
  const s = evaluate(input([v('ramen', '2026-11-01 12:00', { lat: 36, lng: 140 })]))
  expect(get(s, 'far_10')).toMatchObject({ earnedAt: null, have: null })
  expect(get(s, 'far_10').def.needsHome).toBe(true)
})

test('遠征: 自宅から 3km 先で 遠征隊', () => {
  const home = { lat: 35.65, lng: 139.63 }
  const s = evaluate(input([v('ramen', '2026-11-01 12:00', { lat: 35.65 + 0.03, lng: 139.63 })], { home })) // 北へ約 3.3km
  expect(get(s, 'far_3').earnedAt).toBe(jst('2026-11-01 12:00'))
  expect(get(s, 'far_10')).toMatchObject({ earnedAt: null, have: 3.3 })
})

test('四方八方: 北東南西 1km 先で取れる、3方向では取れない', () => {
  const home = { lat: 35.65, lng: 139.63 }
  const d = 0.012 // 約 1.1〜1.3km
  const three = [
    v('ramen', '2026-11-01 12:00', { lat: home.lat + d, lng: home.lng }),
    v('ramen', '2026-11-02 12:00', { lat: home.lat, lng: home.lng + d * 1.3 }),
    v('ramen', '2026-11-03 12:00', { lat: home.lat - d, lng: home.lng }),
  ]
  expect(get(evaluate(input(three, { home })), 'far_compass')).toMatchObject({ earnedAt: null, have: 3 })
  const four = [...three, v('ramen', '2026-11-04 12:00', { lat: home.lat, lng: home.lng - d * 1.3 })]
  expect(get(evaluate(input(four, { home })), 'far_compass').earnedAt).toBe(jst('2026-11-04 12:00'))
})

test('年越しそば は 12/31 日本時間のそば、ゾロ目は 11:11', () => {
  const s = evaluate(input([v('soba', '2026-12-31 23:30'), v('cafe', '2026-11-05 11:11')]))
  expect(get(s, 'season_soba').earnedAt).toBe(jst('2026-12-31 23:30'))
  expect(get(s, 'quirky_zorome').earnedAt).toBe(jst('2026-11-05 11:11'))
  const t = evaluate(input([v('soba', '2027-01-01 00:30')]))
  expect(get(t, 'season_soba').earnedAt).toBeNull()
})

test('世界一周と甘いもの別腹', () => {
  const s = evaluate(input([v('sushi', '2026-11-05 11:00'), v('burger', '2026-11-05 14:00'), v('chinese', '2026-11-05 19:00'), v('cake', '2026-11-05 20:00')]))
  expect(get(s, 'hashigo_world').earnedAt).toBe(jst('2026-11-05 19:00'))
  expect(get(s, 'quirky_sweets').earnedAt).toBe(jst('2026-11-05 20:00'))
  expect(get(s, 'hashigo_course').earnedAt).toBe(jst('2026-11-05 20:00'))
})

test('同じ店: 顔なじみ と ひとすじ', () => {
  const same = (when: string) => v('ramen', when, { shopId: 'X' })
  const s = evaluate(input([same('2026-11-01 12:00'), same('2026-11-02 12:00'), same('2026-11-03 12:00')]))
  expect(get(s, 'regular_3').earnedAt).toBe(jst('2026-11-03 12:00'))
  expect(get(s, 'quirky_hitosuji').earnedAt).toBe(jst('2026-11-03 12:00'))
  expect(get(s, 'explore_new_10').have).toBe(1)
})

test('気配と謎の気配', () => {
  const s = evaluate(input([v('ramen', '2026-11-01 12:00', { wasHint: true, mysteryHint: true })]))
  expect(get(s, 'hint_1').earnedAt).toBe(jst('2026-11-01 12:00'))
  expect(get(s, 'hint_mystery').earnedAt).toBe(jst('2026-11-01 12:00'))
})

test('recentEarned は新しい順に n 個', () => {
  const s = evaluate(input([v('ramen', '2026-11-01 08:00'), v('cafe', '2026-11-02 12:00')]))
  const r = recentEarned(s, 2)
  expect(r).toHaveLength(2)
  expect(r[0].earnedAt).toBe(jst('2026-11-02 12:00'))
  expect(r[0].earnedAt! >= r[1].earnedAt!).toBe(true)
})

test('seriesOf: ジャンルは種類ごとに1つ。顔は取れたいちばん上、次は最初のまだの段', () => {
  const s = evaluate(input([v('ramen', '2026-11-01 12:00'), v('ramen', '2026-11-02 12:00'), v('ramen', '2026-11-03 12:00')]))
  const series = seriesOf(s)
  const ramen = series.find((x) => x.face.def.series === 'genre_ramen')!
  expect(ramen.steps).toHaveLength(5)
  expect(ramen.face.def.id).toBe('genre_ramen_2')
  expect(ramen.next?.def.id).toBe('genre_ramen_3')
  const sushi = series.find((x) => x.face.def.series === 'genre_sushi')!
  expect(sushi.face.def.id).toBe('genre_sushi_1')
  expect(series.filter((x) => x.face.def.group === 'genre')).toHaveLength(18)
})
