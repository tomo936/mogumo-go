import type { LatLng } from '../domain/geo.ts'
import type { Fix } from '../domain/smoothing.ts'

const TOKYO_STATION: LatLng = { lat: 35.6812, lng: 139.7671 }
const STEP_M = 1.4
const SIDE_STEPS = 60 // 1辺 84m の四角い道を歩く
const M_PER_DEG_LAT = 111195

// 開発用の「歩いたふり」。PC で追従の動きを確かめる・dev のサイトで結合試験をするために使う
export function startFakeWalk(onFix: (fix: Fix) => void, start: LatLng = TOKYO_STATION, now: () => number = Date.now): () => void {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((start.lat * Math.PI) / 180)
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]] // 北・東・南・西（緯度, 経度）
  let n = 0
  let pos = { ...start }
  const id = setInterval(() => {
    const [dLat, dLng] = dirs[Math.floor(n / SIDE_STEPS) % 4]
    pos = { lat: pos.lat + (dLat * STEP_M) / M_PER_DEG_LAT, lng: pos.lng + (dLng * STEP_M) / mPerDegLng }
    n++
    onFix({ ...pos, accuracy: 5, time: now() })
  }, 1000)
  return () => clearInterval(id)
}

// 開発中と dev のサイトだけ（外から結合試験をするため。2026-11-17 オーナー）。本番のサイトでは使えない
const DEV_SITE = 'mogumo-go-dev.vercel.app'
export function isFakeWalkEnabled(search: string, dev: boolean, hostname = ''): boolean {
  return (dev || hostname === DEV_SITE) && new URLSearchParams(search).has('fake')
}

// ?fake=緯度,経度 で始める場所（無い・読めないときは null）
export function fakeStart(search: string): LatLng | null {
  const m = (new URLSearchParams(search).get('fake') ?? '').match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}
