import type { GeoFailure } from '../../map/domain/locationStatus.ts'
import type { Home } from '../domain/home.ts'

const FAILURES: Record<number, GeoFailure> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' }

// 自宅を合わせる画面の出発点として、現在地を1回だけ取る
export function getCurrentLocation(geo: Geolocation = navigator.geolocation): Promise<Home> {
  return new Promise((resolve, reject) => {
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(FAILURES[e.code] ?? 'unavailable'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  })
}
