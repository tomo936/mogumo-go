import { describe, expect, it } from 'vitest'
import { whereText } from './hintText.ts'

const here = { lat: 35.65, lng: 139.63 }
const north = (m: number) => ({ lat: here.lat + m / 111_320, lng: here.lng })

describe('whereText', () => {
  it('今いる場所から、方角と距離（1km 未満は 10m 単位）', () => {
    expect(whereText({ pos: here, from: 'here' }, north(347))).toBe('ここから 北へ 350m')
  })
  it('1km 以上は km（小数 1 桁）、自宅からなら「自宅から」', () => {
    expect(whereText({ pos: here, from: 'home' }, north(1234))).toBe('自宅から 北へ 1.2km')
  })
  it('すぐ近くは「すぐ近く」', () => {
    expect(whereText({ pos: here, from: 'here' }, north(5))).toBe('ここから すぐ近く')
  })
})
