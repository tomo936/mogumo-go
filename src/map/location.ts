import type { Fix } from './smoothing.ts'

export type GeoFailure = 'denied' | 'unavailable' | 'timeout'

const FAILURES: Record<number, GeoFailure> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' }

// 位置の監視。位置はこの関数を呼んだ側（React の外）にだけ渡す。サーバーには送らない
export function watchLocation(
  onFix: (fix: Fix) => void,
  onError: (failure: GeoFailure) => void,
  geo: Geolocation = navigator.geolocation,
): () => void {
  const id = geo.watchPosition(
    (p) => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, time: p.timestamp }),
    (e) => onError(FAILURES[e.code] ?? 'unavailable'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  )
  return () => geo.clearWatch(id)
}
