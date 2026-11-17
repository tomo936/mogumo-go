// 地図のタイル（z/x/y）の範囲と、点がその近くにあるか。新しく届いたタイルのまわりのお店を置き直すのに使う
// （建物がタイルの境目にかかると、片方のタイルだけで置いた形のまま残っていた。2026-11-17 オーナー「コルティがたまに 4 軒」）
import type { LatLng } from '../../map/domain/geo.ts'

export type TileBox = { west: number; south: number; east: number; north: number }

const lat = (y: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI

export function tileBox(z: number, x: number, y: number): TileBox {
  const n = 2 ** z
  return { west: (x / n) * 360 - 180, east: ((x + 1) / n) * 360 - 180, north: lat(y, n), south: lat(y + 1, n) }
}

const M_PER_DEG = 111195

// 点がタイルの範囲から marginM 以内か
export function nearBox(p: LatLng, b: TileBox, marginM: number): boolean {
  const dLat = marginM / M_PER_DEG
  const dLng = marginM / (M_PER_DEG * Math.cos((p.lat * Math.PI) / 180))
  return p.lat >= b.south - dLat && p.lat <= b.north + dLat && p.lng >= b.west - dLng && p.lng <= b.east + dLng
}
