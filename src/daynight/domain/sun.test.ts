import { describe, expect, it } from 'vitest'
import { isNightAt, sunTimes } from './sun.ts'

const tokyo = { lat: 35.68, lng: 139.77 }
const jst = (iso: string) => new Date(`${iso}+09:00`)
const hm = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(11, 16)
const near = (got: Date, want: string) => {
  const [h, m] = want.split(':').map(Number)
  const g = new Date(got.getTime() + 9 * 3600_000)
  return Math.abs(g.getUTCHours() * 60 + g.getUTCMinutes() - (h * 60 + m))
}

describe('日の出・日の入り（国立天文台の暦と数分以内）', () => {
  it('東京 2026-11-17: 日の出 6:16 ごろ・日の入り 16:32 ごろ', () => {
    const t = sunTimes(jst('2026-11-17T12:00:00'), tokyo.lat, tokyo.lng)!
    expect(near(t.rise, '06:16'), hm(t.rise)).toBeLessThanOrEqual(4)
    expect(near(t.set, '16:32'), hm(t.set)).toBeLessThanOrEqual(4)
  })
  it('東京 2026-06-21（夏至）: 日の出 4:26 ごろ・日の入り 19:00 ごろ', () => {
    const t = sunTimes(jst('2026-06-21T12:00:00'), tokyo.lat, tokyo.lng)!
    expect(near(t.rise, '04:26'), hm(t.rise)).toBeLessThanOrEqual(4)
    expect(near(t.set, '19:00'), hm(t.set)).toBeLessThanOrEqual(4)
  })
  it('那覇は東京より日の入りが遅い', () => {
    const d = jst('2026-11-17T12:00:00')
    expect(sunTimes(d, 26.21, 127.68)!.set.getTime()).toBeGreaterThan(sunTimes(d, tokyo.lat, tokyo.lng)!.set.getTime())
  })
})

describe('夜かどうか（日の入りから次の日の出まで）', () => {
  it('昼・夕方・夜・夜明け前', () => {
    expect(isNightAt(jst('2026-11-17T12:00:00'), tokyo.lat, tokyo.lng)).toBe(false)
    expect(isNightAt(jst('2026-11-17T16:00:00'), tokyo.lat, tokyo.lng)).toBe(false)
    expect(isNightAt(jst('2026-11-17T17:00:00'), tokyo.lat, tokyo.lng)).toBe(true)
    expect(isNightAt(jst('2026-11-17T23:30:00'), tokyo.lat, tokyo.lng)).toBe(true)
    expect(isNightAt(jst('2026-11-18T05:00:00'), tokyo.lat, tokyo.lng)).toBe(true)
    expect(isNightAt(jst('2026-11-18T07:00:00'), tokyo.lat, tokyo.lng)).toBe(false)
  })
})
