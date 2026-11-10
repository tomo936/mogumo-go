import { describe, expect, it } from 'vitest'
import { CATALOG, countProgress, daysLeft, drawMissions, kindOf, parseDraw, weekEndMs, weekLastDay, weekStart, weekStartMs } from './core.ts'
import type { MissionRow, Visit } from './core.ts'
import { kindFromHotpepper, kindFromMap } from './kind.ts'
import * as app from '../../../src/shops/domain/kind.ts'

const at = (iso: string) => Date.parse(iso) // '+09:00' つきで書く

describe('週のさかい目（日本時間の月曜 0 時）', () => {
  it('日曜 23:59 JST は前の週、月曜 0:00 JST は次の週', () => {
    expect(weekStart(at('2026-11-15T23:59:00+09:00'))).toBe('2026-11-09')
    expect(weekStart(at('2026-11-16T00:00:00+09:00'))).toBe('2026-11-16')
    expect(weekStart(at('2026-11-15T15:30:00Z'))).toBe('2026-11-16') // UTC では日曜でも JST は月曜
  })
  it('週の始まり・終わり・最後の日', () => {
    expect(weekStartMs('2026-11-09')).toBe(at('2026-11-09T00:00:00+09:00'))
    expect(weekEndMs('2026-11-09')).toBe(at('2026-11-16T00:00:00+09:00'))
    expect(weekLastDay('2026-11-09')).toBe('2026-11-15')
  })
  it('のこりの日数（今日を含めて日曜まで）', () => {
    expect(daysLeft(at('2026-11-09T08:00:00+09:00'))).toBe(7)
    expect(daysLeft(at('2026-11-15T08:00:00+09:00'))).toBe(1)
  })
})

describe('出題', () => {
  const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length] }
  const mon = at('2026-11-09T10:00:00+09:00')
  const full = { kinds: { ramen: 3, cafe: 2, sushi: 1 }, hasHome: true, nowMs: mon }

  it('かんたん・ふつう・むずかしいを1つずつ、系は重ならない、ごほうびは 50/100/150', () => {
    for (let s = 0; s < 50; s++) {
      let x = s / 50
      const d = drawMissions(full, () => (x = (x * 9301 + 0.4927) % 1))
      expect(d.map((m) => m.difficulty)).toEqual(['easy', 'normal', 'hard'])
      expect(d.map((m) => m.reward)).toEqual([50, 100, 150])
      expect(new Set(d.map((m) => m.family)).size).toBe(3)
    }
  })
  it('まわりに種類が無い・自宅なし・日曜の出題でも3つ埋まり、出せないものは出ない', () => {
    const sun = at('2026-11-15T10:00:00+09:00')
    for (let s = 0; s < 50; s++) {
      let x = s / 50
      const d = drawMissions({ kinds: {}, hasHome: false, nowMs: sun }, () => (x = (x * 9301 + 0.4927) % 1))
      expect(d).toHaveLength(3)
      for (const m of d) expect(['genre_week', 'oyatsu', 'meguri', 'far2', 'far4', 'mainichi', 'hashigo', 'weekend']).not.toContain(m.key)
    }
  })
  it('めぐりは2軒以上ある種類から、今週の◯◯は1軒以上から（mystery は選ばない）', () => {
    const meguri = CATALOG.findIndex((e) => e.key === 'meguri')
    expect(meguri).toBeGreaterThan(-1)
    // むずかしい（最初）→ ふつう（めぐりを引く）→ かんたん
    const normals = CATALOG.filter((e) => e.difficulty === 'normal')
    const r = seq(0, normals.findIndex((e) => e.key === 'meguri') / normals.length + 0.001, 0.99, 0)
    const d = drawMissions({ kinds: { ramen: 3, cafe: 1, mystery: 9 }, hasHome: true, nowMs: mon }, r)
    const m = d.find((x) => x.key === 'meguri')
    expect(m?.kinds).toEqual(['ramen'])
  })
})

describe('進みの数え方', () => {
  const week = '2026-11-09'
  const created = at('2026-11-10T09:00:00+09:00')
  const v = (iso: string, o: Partial<Visit> = {}): Visit => ({ shopId: 'hp:1', at: at(iso), wasHint: false, far: false, genreCode: 'G013', genreName: null, name: 'らーめん', ...o })
  const row = (type: MissionRow['type'], target: number, kinds: MissionRow['kinds'] = []): MissionRow => ({ type, target, kinds, createdAt: created })

  it('出題より前・週の後は数えない', () => {
    const vs = [v('2026-11-10T08:59:00+09:00', { wasHint: true }), v('2026-11-12T12:00:00+09:00', { wasHint: true, shopId: 'hp:2' }), v('2026-11-16T00:00:00+09:00', { wasHint: true, shopId: 'hp:3' })]
    expect(countProgress(row('hint_shop', 3), week, vs, 0)).toBe(1)
  })
  it('はじめて／また来た は出題前の訪問も見る', () => {
    const vs = [v('2026-11-01T12:00:00+09:00', { shopId: 'hp:1' }), v('2026-11-11T12:00:00+09:00', { shopId: 'hp:1' }), v('2026-11-12T12:00:00+09:00', { shopId: 'hp:2' })]
    expect(countProgress(row('first_visit', 5), week, vs, 0)).toBe(1)
    expect(countProgress(row('revisit', 1), week, vs, 0)).toBe(1)
  })
  it('ジャンル・ちがうジャンル（その他は数えない）', () => {
    const vs = [
      v('2026-11-11T12:00:00+09:00', { shopId: 'hp:1', genreCode: 'G013', name: 'らーめん' }),
      v('2026-11-11T15:00:00+09:00', { shopId: 'hp:2', genreCode: 'G014', name: 'カフェ' }),
      v('2026-11-12T15:00:00+09:00', { shopId: 'hp:3', genreCode: null, name: 'なぞのお店' }),
    ]
    expect(countProgress(row('genre', 2, ['cafe', 'cake', 'bakery']), week, vs, 0)).toBe(1)
    expect(countProgress(row('distinct_kinds', 5), week, vs, 0)).toBe(2)
  })
  it('お昼のさかい目（11:00〜13:59）・土日・毎日・はしご', () => {
    const vs = [
      v('2026-11-11T10:59:00+09:00', { shopId: 'a' }), v('2026-11-11T11:00:00+09:00', { shopId: 'b' }),
      v('2026-11-11T13:59:00+09:00', { shopId: 'c' }), v('2026-11-11T14:00:00+09:00', { shopId: 'd' }),
      v('2026-11-14T12:00:00+09:00', { shopId: 'e' }), v('2026-11-15T23:30:00+09:00', { shopId: 'f' }),
    ]
    expect(countProgress(row('lunch', 3), week, vs, 0)).toBe(3)
    expect(countProgress(row('weekend', 3), week, vs, 0)).toBe(2)
    expect(countProgress(row('active_days', 4), week, vs, 0)).toBe(3)
    expect(countProgress(row('hashigo_days', 2), week, vs, 0)).toBe(1)
  })
  it('遠く・晴れ間・目標で止まる', () => {
    const vs = [v('2026-11-11T12:00:00+09:00', { far: true, shopId: 'a' }), v('2026-11-12T12:00:00+09:00', { far: true, shopId: 'b' }), v('2026-11-13T12:00:00+09:00', { far: true, shopId: 'c' })]
    expect(countProgress(row('far_from_home', 2), week, vs, 0)).toBe(2)
    expect(countProgress(row('fog_cells', 400), week, [], 512)).toBe(400)
  })
  it('地図の店は分類で種類を決める', () => {
    expect(kindOf({ shopId: 'osm:1', genreCode: null, genreName: 'bakery', name: 'パン屋' })).toBe('bakery')
  })
})

describe('kind の写しが元と同じ', () => {
  const names = ['らーめん太郎', '寿司まる', '丸亀製麺', 'カレーハウス', 'たこ焼き', 'ケーキ屋', 'パン工房', 'なぞの店', '天丼てんや', 'バーガー']
  const codes = [null, 'G001', 'G004', 'G005', 'G007', 'G008', 'G009', 'G013', 'G014', 'G016', 'G017']
  const subs = ['restaurant', 'cafe', 'bakery', 'bar', 'fast_food', 'ice_cream']
  it('ホットペッパー・地図の両方', () => {
    for (const n of names) {
      for (const c of codes) expect(kindFromHotpepper(c, n)).toBe(app.kindFromHotpepper(c, n))
      for (const s of subs) expect(kindFromMap(s, n)).toBe(app.kindFromMap(s, n))
    }
  })
})

describe('端末から来た種類の読み取り', () => {
  it('知らない種類・数でないものは捨てる', () => {
    expect(parseDraw({ kinds: { ramen: 2, foo: 3, cafe: 'x', sushi: -1 }, has_home: true })).toEqual({ kinds: { ramen: 2 }, hasHome: true })
    expect(parseDraw(null)).toBeNull()
  })
})
