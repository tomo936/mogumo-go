// ワールドマップ（全画面）。日本全体に、行った町ごとに旗を立てる（数字にはまとめない。2026-11-12 オーナー）。
// 旗は右のボタンで出す・隠す。町名の札は寄ったときだけ。上に検索、下に帯。
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../map/infra/maplibreWorker.ts'
import { MAP_THEME, STYLE_URL } from '../../map/config.ts'
import { THEMES, pickTheme } from '../../map/infra/themes.ts'
import { themeStyle } from '../../map/infra/theme.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { TownProgress } from '../../towns/domain/progress.ts'
import { boxCenter, zoomForBox } from '../domain/box.ts'
import type { Box } from '../domain/box.ts'
import { loadTownBoxes } from '../infra/townBoxes.ts'
import { PlaceSearch } from './PlaceSearch.tsx'
import './world.css'

const WORLD_MIN_ZOOM = 4
const WORLD_MAX_ZOOM = 11
const JAPAN: [number, number] = [136.5, 37.6]
const NAME_ZOOM = 7 // これより寄ったら町名の札を出す（引いたときは旗だけ）
// 地面に立てた旗（クリア＝橙、途中＝クリーム）。下の端が町の位置
const flagSvg = (fill: string) =>
  `<svg width="36" height="43" viewBox="0 0 30 36" aria-hidden="true"><ellipse cx="9" cy="33" rx="6" ry="2.2" fill="rgba(90,60,30,.25)"/><path d="M9 33V5" stroke="#7a4a26" stroke-width="2.6" stroke-linecap="round"/><path d="M10 5.5h15.5l-4 5.2 4 5.2H10z" fill="${fill}" stroke="#7a4a26" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="4" r="2.4" fill="#f6c453" stroke="#7a4a26" stroke-width="1.4"/></svg>`
const CLEAR_FLAG = flagSvg('#e8782f')
const NOT_YET_FLAG = flagSvg('#fff4dc')

type TownMark = { id: string; name: string; cleared: boolean; lat: number; lng: number }

type Props = {
  towns: TownProgress[]
  onClose: () => void
  onOpen: (t: { name: string; center: LatLng; zoom: number }) => void
  loadBoxes?: (ids: string[]) => Promise<Map<string, Box>>
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export function WorldMap({ towns, onClose, onOpen, loadBoxes = loadTownBoxes }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [boxes, setBoxes] = useState<Map<string, Box>>(new Map())
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const redraw = useRef<() => void>(() => {})
  const [flags, setFlags] = useState(true) // 旗を出すか
  const flagsRef = useRef(flags)
  flagsRef.current = flags
  const [far, setFar] = useState(true) // 引いて見ている（町名の札を隠す）

  const marks = useMemo(
    () =>
      towns.flatMap((t) => {
        const b = boxes.get(t.id)
        if (!b) return [] // 四角が読めない町は旗を出さないだけ
        const c = boxCenter(b)
        return [{ id: t.id, name: t.name, cleared: t.clearedAt !== null, lat: c.lat, lng: c.lng } satisfies TownMark]
      }),
    [towns, boxes],
  )
  const marksRef = useRef(marks)
  marksRef.current = marks

  const ids = towns.map((t) => t.id).join('|')
  useEffect(() => {
    if (ids === '') return
    let alive = true
    loadBoxes(ids.split('|'))
      .then((m) => alive && setBoxes(m))
      .catch(() => {}) // 読めなければ旗を出さないだけ
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const theme = THEMES[pickTheme(window.location.search, MAP_THEME)]
    const map = new MapLibreMap({
      container: el,
      style: STYLE_URL,
      transformStyle: (_prev, next) => themeStyle(next, theme),
      center: JAPAN,
      zoom: 4.15,
      minZoom: WORLD_MIN_ZOOM,
      maxZoom: WORLD_MAX_ZOOM,
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      attributionControl: false,
    })
    map.touchZoomRotate.disableRotation()
    mapRef.current = map
    let markers: Marker[] = []
    const draw = () => {
      for (const m of markers) m.remove()
      markers = []
      if (!flagsRef.current) return
      for (const mark of marksRef.current) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = `tw ${mark.cleared ? 'clear' : ''}`
        btn.setAttribute('aria-label', mark.name)
        btn.innerHTML = (mark.cleared ? CLEAR_FLAG : NOT_YET_FLAG) + `<span>${esc(mark.name)}</span>`
        btn.addEventListener('click', () => {
          const b = boxesRef.current.get(mark.id)
          if (!b) return
          onOpenRef.current({
            name: mark.name,
            center: boxCenter(b),
            zoom: zoomForBox(b, el.clientWidth || 390, el.clientHeight || 844, 13, 17),
          })
        })
        // 旗の竿の根元（左下寄り）が町の位置。札は旗の下に出る
        markers.push(new Marker({ element: btn, anchor: 'top', offset: [7, -40] }).setLngLat([mark.lng, mark.lat]).addTo(map))
      }
    }
    redraw.current = draw
    map.on('load', () => {
      // 遠くでは道・境界・文字を消す（日本全体を見るだけの地図）
      for (const l of map.getStyle().layers) {
        const sl = (l as { 'source-layer'?: string })['source-layer']
        if (l.type === 'symbol' || sl === 'transportation' || sl === 'aeroway' || sl === 'boundary') map.setLayoutProperty(l.id, 'visibility', 'none')
      }
      draw()
    })
    map.on('zoomend', () => setFar(map.getZoom() < NAME_ZOOM))
    return () => {
      redraw.current = () => {}
      for (const m of markers) m.remove()
      mapRef.current = null
      map.remove()
    }
  }, [])

  const boxesRef = useRef(boxes)
  boxesRef.current = boxes
  useEffect(() => {
    redraw.current()
  }, [marks, flags])

  const cleared = towns.filter((t) => t.clearedAt !== null).length
  return (
    <section className={`wm ${far ? 'wm--far' : ''}`} aria-label="ワールドマップ">
      <div ref={ref} className="wm-map" />
      <PlaceSearch
        onBack={onClose}
        onPick={(p) => onOpen({ name: p.title, center: { lat: p.lat, lng: p.lng }, zoom: 15 })}
      />
      <button
        type="button"
        className={`wm-flags ${flags ? 'on' : ''}`}
        aria-label={flags ? '旗を隠す' : '旗を出す'}
        aria-pressed={flags}
        onClick={() => setFlags((v) => !v)}
      >
        <span dangerouslySetInnerHTML={{ __html: flags ? CLEAR_FLAG : NOT_YET_FLAG }} />
        <small>{flags ? '旗 ON' : '旗 OFF'}</small>
      </button>
      <div className="wm-band" aria-label={`行った町 ${towns.length} クリア ${cleared}`}>
        <div className="cell"><b>{towns.length}</b><span>行った町</span></div>
        <div className="sep" />
        <div className="cell"><b>{cleared}</b><span>クリア</span></div>
      </div>
    </section>
  )
}
