// 夜のお店の足元の光（A14）。地図の円の層（ぼかし）で地面に描く。
// 3D の板で描いていたときは、地面と前後を取り合って色つきの点々が出た・重かったので、地図の機能に替えた（2026-11-17 オーナー「下の光は好き、ゴミはいらない」）
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { isNight, onPhase } from './phase.ts'

const SOURCE = 'night-glow'
const LAYER = 'night-glow'
const GLOW_RADIUS = 1.5 // お店の幅の何倍の半径か
const EARTH = 40075016.686 // 赤道の長さ（m）。512px タイルで倍率 0 の 1px = EARTH*cos(lat)/512 m

type Spot = { lat: number; lng: number; sizeM: number }

const features = (spots: Spot[]) => ({
  type: 'FeatureCollection' as const,
  features: spots.map((s) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
    // 倍率 0 での半径（px）。描くときに 2^倍率 を掛けて、地面の上で一定の m にする
    properties: { r0: (s.sizeM * GLOW_RADIUS) / ((EARTH * Math.cos((s.lat * Math.PI) / 180)) / 512) },
  })),
})

export function createGlowLayer() {
  let map: MapLibreMap | null = null
  let spots: Spot[] = []
  let stop: (() => void) | null = null
  const show = (n: boolean) => map?.getLayer(LAYER) && map.setLayoutProperty(LAYER, 'visibility', n ? 'visible' : 'none')
  return {
    attach(m: MapLibreMap, beforeId?: string) {
      map = m
      m.addSource(SOURCE, { type: 'geojson', data: features(spots) })
      m.addLayer(
        {
          id: LAYER,
          type: 'circle',
          source: SOURCE,
          layout: { visibility: isNight() ? 'visible' : 'none' },
          paint: {
            'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, ['get', 'r0'], 24, ['*', ['get', 'r0'], 2 ** 24]],
            'circle-color': '#ffb260',
            'circle-opacity': 0.6,
            'circle-blur': 1,
            'circle-pitch-alignment': 'map',
            'circle-pitch-scale': 'map',
          },
        },
        beforeId,
      )
      stop = onPhase(show)
    },
    setShops(next: Spot[]) {
      spots = next
      ;(map?.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(features(spots))
    },
    detach() {
      stop?.()
      stop = null
      map = null
    },
  }
}
