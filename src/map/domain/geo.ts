import type { Polygon } from 'geojson'

export type LatLng = { lat: number; lng: number }

const EARTH_RADIUS_M = 6371008.8
const rad = (deg: number) => (deg * Math.PI) / 180

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// 半径 radiusM の円を steps 角形で近似する（地図の傾きに合わせて楕円に見える）
export function circlePolygon(center: LatLng, radiusM: number, steps = 64): Polygon {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI)
  const dLng = dLat / Math.cos(rad(center.lat))
  const ring: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    ring.push([center.lng + dLng * Math.cos(t), center.lat + dLat * Math.sin(t)])
  }
  ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

export type P = { x: number; y: number } // m（x=東、y=北）

// origin を (0,0) とする平らな座標（数百 m の範囲なら誤差は無視できる）
export function localFrame(origin: LatLng) {
  const mLat = (EARTH_RADIUS_M * Math.PI) / 180
  const mLng = mLat * Math.cos(rad(origin.lat))
  return {
    to: (p: LatLng): P => ({ x: (p.lng - origin.lng) * mLng, y: (p.lat - origin.lat) * mLat }),
    back: (p: P): LatLng => ({ lat: origin.lat + p.y / mLat, lng: origin.lng + p.x / mLng }),
  }
}
