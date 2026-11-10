// 記録の地図: 本物の地図を真上から見て、その上にアプリの地図と同じ雲を重ねる。
// スライダーの日付までに晴れたマスだけを「晴れた場所」にして、雲を作り直す。中心は自宅。
import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
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
import type { DayPin } from '../domain/dayPins.ts'
import { PIN_ICON } from '../../shops/infra/pinIcons.ts'

type Props = { cells: ClearedCell[]; t: number; home: LatLng | null; pins: DayPin[] }

const mdLabel = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`

export function RecordMap({ cells, t, home, pins }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
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
    mapRef.current = map
    // 自宅の目印（雲の上に出る。家のアイコンの丸とやさしい輪）
    let homeMarker: Marker | null = null
    if (home) {
      const el = document.createElement('div')
      el.className = 'rc-home'
      el.setAttribute('aria-label', '自宅')
      el.innerHTML =
        '<span class="rc-home__ring"></span><span class="rc-home__disc"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/></svg></span><span class="rc-home__label">自宅</span>'
      homeMarker = new Marker({ element: el, anchor: 'center' }).setLngLat([home.lng, home.lat]).addTo(map)
    }
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
      homeMarker?.remove()
      mapRef.current = null
      map.remove()
    }
    // 地図は日付が変わっても作り直さない（cells・home が読み込めた最初の値で作る）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    apply.current(t)
  }, [t])

  // 行ったお店のピン（スライダーの日のお店は大きく番号つき）。押すと店名と日付の札
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let openTag: HTMLElement | null = null
    const markers = pins.map((p) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = p.today ? 'rc-pin rc-pin--today' : 'rc-pin'
      el.setAttribute('aria-label', `${p.name} ${mdLabel(p.lastDay)}`)
      const img = document.createElement('img')
      img.src = PIN_ICON[p.kind]
      img.alt = ''
      el.append(img)
      if (p.order !== null) {
        const num = document.createElement('b')
        num.className = 'rc-pin__num'
        num.textContent = String(p.order)
        el.append(num)
      }
      const tag = document.createElement('span')
      tag.className = 'rc-pin__tag'
      tag.textContent = `${p.name} ・ ${mdLabel(p.lastDay)}`
      tag.hidden = true
      el.append(tag)
      el.addEventListener('click', () => {
        const show = tag.hidden
        if (openTag) openTag.hidden = true
        tag.hidden = !show
        openTag = show ? tag : null
      })
      return new Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map)
    })
    return () => {
      for (const m of markers) m.remove()
    }
  }, [pins])

  return <div ref={containerRef} className="rc-map" role="img" aria-label="自宅を中心にした、晴れた場所と雲の地図（真上から）" />
}
