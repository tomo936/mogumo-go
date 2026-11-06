import { describe, expect, it } from 'vitest'
import { kindOf } from './genre.ts'
import type { ShopKind } from './shop.ts'

type Case = [string, Record<string, string>, string, ShopKind]

const cases: Case[] = [
  ['ramen cuisine', { amenity: 'restaurant', cuisine: 'ramen' }, '', 'ramen'],
  ['ramen name らーめん', { amenity: 'restaurant' }, '麺屋 らーめん太郎', 'ramen'],
  ['ramen name 中華そば', { amenity: 'restaurant' }, '中華そば 青葉', 'ramen'],
  ['sushi cuisine', { cuisine: 'sushi' }, '', 'sushi'],
  ['sushi name', { amenity: 'restaurant' }, '鮨 さかな', 'sushi'],
  ['soba cuisine', { cuisine: 'soba;udon' }, '', 'soba'],
  ['soba name', { amenity: 'restaurant' }, '手打ち蕎麦', 'soba'],
  ['curry cuisine', { cuisine: 'indian' }, '', 'curry'],
  ['curry name', { amenity: 'restaurant' }, 'カレーの店', 'curry'],
  ['yakiniku', { cuisine: 'korean' }, '', 'yakiniku'],
  ['chinese', { cuisine: 'chinese' }, '', 'chinese'],
  ['western', { cuisine: 'pizza' }, '', 'western'],
  ['washoku', { cuisine: 'japanese' }, '', 'washoku'],
  ['yakitori is izakaya', { cuisine: 'yakitori' }, '', 'izakaya'],
  ['pub', { amenity: 'pub' }, '', 'izakaya'],
  ['confectionery', { shop: 'confectionery' }, '', 'cake'],
  ['ice cream', { amenity: 'ice_cream' }, '', 'cake'],
  ['bakery', { shop: 'bakery' }, '', 'bakery'],
  ['cafe', { amenity: 'cafe' }, '', 'cafe'],
  ['cafe with cake', { amenity: 'cafe', cuisine: 'cake' }, '', 'cake'],
  ['fast food burger', { amenity: 'fast_food', cuisine: 'burger' }, '', 'mystery'],
  ['plain restaurant', { amenity: 'restaurant' }, '', 'mystery'],
  ['multi cuisine, upper row wins', { cuisine: 'japanese;sushi' }, '', 'sushi'],
  ['cuisine case and spaces', { cuisine: 'Udon; Ramen' }, '', 'ramen'],
]

describe('kindOf', () => {
  it.each(cases)('%s', (_label, tags, name, kind) => {
    expect(kindOf(tags, name)).toBe(kind)
  })
})
