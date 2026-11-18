import { useEffect, useRef } from 'react'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../map/infra/maplibreWorker.ts'
import { INITIAL_ZOOM, MAP_THEME, MAX_ZOOM, MIN_ZOOM, STYLE_URL } from '../../map/config.ts'
import { themeStyle } from '../../map/infra/theme.ts'
import { THEMES } from '../../map/infra/themes.ts'
import type { Home } from '../domain/home.ts'

type Props = { start: Home; recenter: number; onCenterChange: (center: Home) => void }

// 自宅を合わせる地図。メイン画面と違い、指で動かせる（回転・傾きはなし）。家の印は画面中央に固定
export function HomePickerMap({ start, recenter, onCenterChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onChange = useRef(onCenterChange)
  useEffect(() => {
    onChange.current = onCenterChange
  })

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: STYLE_URL,
      transformStyle: (_prev, next) => themeStyle(next, THEMES[MAP_THEME]),
      center: [start.lng, start.lat],
      zoom: INITIAL_ZOOM,
      minZoom: MIN_ZOOM - 1,
      maxZoom: MAX_ZOOM,
      pitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    })
    map.touchZoomRotate.disableRotation()
    mapRef.current = map
    onChange.current(start)
    // 動いている途中も中心を知らせる（慣性で動いている間に確定されても、印の位置を保存するため）
    map.on('move', () => {
      const c = map.getCenter()
      onChange.current({ lat: c.lat, lng: c.lng })
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [start])

  useEffect(() => {
    if (recenter > 0) mapRef.current?.easeTo({ center: [start.lng, start.lat] })
  }, [recenter, start])

  return (
    <div className="home-picker">
      <div ref={containerRef} className="home-picker-map" />
      <div className="home-pin" aria-hidden="true" />
    </div>
  )
}
