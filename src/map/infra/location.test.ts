import { expect, test, vi } from 'vitest'
import { watchLocation } from './location.ts'

function fakeGeo() {
  let success: PositionCallback = () => {}
  let failure: PositionErrorCallback = () => {}
  const geo = {
    watchPosition: vi.fn((s: PositionCallback, e?: PositionErrorCallback | null) => {
      success = s
      failure = e ?? (() => {})
      return 7
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  }
  return {
    geo: geo as unknown as Geolocation,
    clearWatch: geo.clearWatch,
    emit: (lat: number, lng: number, accuracy: number, timestamp: number) =>
      success({ coords: { latitude: lat, longitude: lng, accuracy }, timestamp } as GeolocationPosition),
    error: (code: number) => failure({ code } as GeolocationPositionError),
  }
}

test('測位を Fix にして渡す', () => {
  const g = fakeGeo()
  const onFix = vi.fn()
  watchLocation(onFix, vi.fn(), g.geo)
  g.emit(35.1, 139.2, 8, 1234)
  expect(onFix).toHaveBeenCalledWith({ lat: 35.1, lng: 139.2, accuracy: 8, time: 1234 })
})

test('エラーコード 1・2・3 を denied・unavailable・timeout にする', () => {
  const g = fakeGeo()
  const onError = vi.fn()
  watchLocation(vi.fn(), onError, g.geo)
  g.error(1)
  g.error(2)
  g.error(3)
  expect(onError.mock.calls).toEqual([['denied'], ['unavailable'], ['timeout']])
})

test('解除すると同じ id で clearWatch する', () => {
  const g = fakeGeo()
  const stop = watchLocation(vi.fn(), vi.fn(), g.geo)
  stop()
  expect(g.clearWatch).toHaveBeenCalledWith(7)
})
