import { describe, expect, it } from 'vitest'
import { hotpepperPageUrl } from './hotpepperLink.ts'

describe('hotpepperPageUrl', () => {
  it('hp: の店はお店のページ', () => {
    expect(hotpepperPageUrl('hp:J001234567')).toBe('https://www.hotpepper.jp/strJ001234567/')
  })
  it('地図の店や形の違う id は null', () => {
    expect(hotpepperPageUrl('osm:123')).toBeNull()
    expect(hotpepperPageUrl('hp:J1/../x')).toBeNull()
    expect(hotpepperPageUrl('hp:')).toBeNull()
  })
})
