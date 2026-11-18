import { expect, test } from 'vitest'
import { getCurrentLocation } from './currentLocation.ts'

const geo = (ok: boolean, code = 1) => ({
  getCurrentPosition: (s: PositionCallback, e?: PositionErrorCallback | null) =>
    ok ? s({ coords: { latitude: 35.1, longitude: 139.2 } } as GeolocationPosition) : e?.({ code } as GeolocationPositionError),
}) as unknown as Geolocation

test('現在地を1回だけ取る', async () => {
  expect(await getCurrentLocation(geo(true))).toEqual({ lat: 35.1, lng: 139.2 })
})

test('取れなかった理由を返す', async () => {
  await expect(getCurrentLocation(geo(false, 1))).rejects.toBe('denied')
  await expect(getCurrentLocation(geo(false, 3))).rejects.toBe('timeout')
})
