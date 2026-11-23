// 地図のカメラの傾き（2026-11-24 オーナー「ポケモン GO のように、引くと真上に近く、寄ると主人公の目線に近く、自然に変わる」）。
// 倍率ごとの傾き（度）を点で決め、そのあいだはなめらかにつなぐ。降りる演出（倍率 13〜14 から）では 0 から始まる。
export type PitchStop = readonly [zoom: number, pitch: number]

export function pitchForZoom(zoom: number, stops: readonly PitchStop[]): number {
  if (stops.length === 0) return 0
  if (zoom <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const [z1, p1] = stops[i]
    if (zoom <= z1) {
      const [z0, p0] = stops[i - 1]
      const t = (zoom - z0) / (z1 - z0)
      const s = t * t * (3 - 2 * t) // 点のところで急に曲がらないよう、なめらかに
      return p0 + (p1 - p0) * s
    }
  }
  return stops[stops.length - 1][1]
}
