// 記録の地図: 本物の地図を真上から見て、その上にアプリの地図と同じ雲を重ねる。
// スライダーの日付までに晴れたマスだけを「晴れた場所」にして、雲を作り直す。中心は自宅。
import { useEffect, useRef } from 'react'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../map/infra/maplibreWorker.ts' // 地図の作業用プログラムの読み込み先（アプリ本体と同じ設定）
import { MAP_THEME, STYLE_URL } from '../../map/config.ts'
import { THEMES, pickTheme } from '../../map/infra/themes.ts'
import { themeStyle } from '../../map/infra/theme.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { clearedFromHome } from '../../fog/domain/clearing.ts'
import { fogClumps } from '../../fog/domain/clumps.ts'
import type { Clump } from '../../fog/domain/clumps.ts'
import { waveClumps } from '../../fog/domain/wave.ts'
import { localFrame } from '../../map/domain/geo.ts'
import { cellKey } from '../../fog/domain/grid.ts'
import { createFogLayer } from '../../fog/infra/fogLayer.ts'
import { clearedAt, type ClearedCell } from '../domain/timeline.ts'
import { MAX_ZOOM, MIN_ZOOM, viewOf, zoomFor } from '../domain/view.ts'

type Props = { cells: ClearedCell[]; t: number; home: LatLng | null }

export function RecordMap({ cells, t, home }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apply = useRef<(t: number) => void>(() => {})

  // 地図は最初に1回だけ作る（日付は apply で変える）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const { center, radiusM } = viewOf(cells, home)
    const theme = THEMES[pickTheme(window.location.search, MAP_THEME)]
    const map = new MapLibreMap({
      container,
      style: STYLE_URL,
      transformStyle: (_prev, next) => themeStyle(next, theme),
      center: [center.lng, center.lat],
      zoom: zoomFor(radiusM, container.clientWidth || 360, center.lat),
      pitch: 0,
      bearing: 0,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      attributionControl: false,
    })
    map.touchZoomRotate.disableRotation()
    const fog = createFogLayer()
    const base = clearedFromHome(home)
    let last: Clump[] = []
    let ready = false
    let pending: number | null = null
    const draw = (time: number) => {
      const cleared = new Set(base)
      for (const c of clearedAt(cells, time)) cleared.add(cellKey(c))
      const next = fogClumps(center, cleared)
      if (last.length > 0 && next.length < last.length) {
        // 晴れるときは、中心から外へ向かって雲が縮んで消える
        fog.setClumps(center, waveClumps(last, next, localFrame(center).to(center), performance.now() / 1000))
      } else {
        fog.setClumps(center, next)
      }
      last = next
      map.triggerRepaint()
    }
    apply.current = (time) => {
      if (!ready) return
      if (pending !== null) cancelAnimationFrame(pending)
      pending = requestAnimationFrame(() => {
        pending = null
        draw(time)
      })
    }
    map.on('load', () => {
      map.addLayer(fog)
      ready = true
      draw(t)
    })
    return () => {
      if (pending !== null) cancelAnimationFrame(pending)
      apply.current = () => {}
      map.remove()
    }
    // 地図は日付が変わっても作り直さない（cells・home が読み込めた最初の値で作る）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    apply.current(t)
  }, [t])

  return <div ref={containerRef} className="rc-map" role="img" aria-label="自宅を中心にした、晴れた場所と雲の地図（真上から）" />
}
