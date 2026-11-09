// 自分の3Dのアバター（揺れるだけ・骨組みなし）の、大きさ・揺れの計算。純粋な計算だけ。

// 地図の1px が何 m か（北緯 lat、ズーム zoom。256px タイルの地図）
export function metersPerPixel(zoom: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

// 画面の高さ heightPx（px）に見える、地図の上での高さ（m）。2D の男の子と同じ見た目の大きさにする
export function heightMeters(heightPx: number, zoom: number, lat: number): number {
  return heightPx * metersPerPixel(zoom, lat)
}

// 立っている間の、息をするような上下の揺れ（模型の高さを 1 としたときの量）
export function bobAmount(timeMs: number): number {
  return 0.02 * Math.sin((2 * Math.PI * timeMs) / 1200)
}
