// ワールドマップ（全画面）。日本全体に、行った町を旗で出す。近い旗は数の丸にまとめる。上に検索、下に帯。
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { renderToStaticMarkup } from 'react-dom/server'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../../map/infra/maplibreWorker.ts'
import { MAP_THEME, STYLE_URL } from '../../map/config.ts'
import { THEMES, pickTheme } from '../../map/infra/themes.ts'
import { themeStyle } from '../../map/infra/theme.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { TownProgress } from '../../towns/domain/progress.ts'
import { TownIcon } from '../../towns/ui/TownIcon.tsx'
import { boxCenter, zoomForBox } from '../domain/box.ts'
import type { Box } from '../domain/box.ts'
import { clusterMarks } from '../domain/cluster.ts'
import type { TownMark } from '../domain/cluster.ts'
import { loadTownBoxes } from '../infra/townBoxes.ts'
import { PlaceSearch } from './PlaceSearch.tsx'
import './world.css'

const WORLD_MIN_ZOOM = 4
const WORLD_MAX_ZOOM = 11
const JAPAN: [number, number] = [136.5, 37.6]
const CLUSTER_PX = 44
const NOT_YET_FLAG =
  '<svg width="34" height="34" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#cbb896"/><circle cx="20" cy="20" r="15.5" fill="#efe6d2"/><path d="M15 11.5v17.5" stroke="#8a6d4b" stroke-width="2.2" stroke-linecap="round"/><path d="M16.6 12.4h10.6l-2.9 3.9 2.9 3.9H16.6z" fill="#8a6d4b"/></svg>'
const CLEAR_FLAG = renderToStaticMarkup(<TownIcon kind="clear" size={34} />)

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
      const points = marksRef.current.map((mark) => {
        const p = map.project([mark.lng, mark.lat])
        return { mark, x: p.x, y: p.y }
      })
      for (const g of clusterMarks(points, CLUSTER_PX)) {
        const first = g.members[0]
        const lngLat: [number, number] = [first.lng, first.lat]
        if (g.members.length === 1) {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = `tw ${first.cleared ? 'clear' : ''}`
          btn.setAttribute('aria-label', first.name)
          btn.innerHTML = (first.cleared ? CLEAR_FLAG : NOT_YET_FLAG) + `<span>${esc(first.name)}</span>`
          btn.addEventListener('click', () => {
            const b = boxesRef.current.get(first.id)
            if (!b) return
            onOpenRef.current({
              name: first.name,
              center: boxCenter(b),
              zoom: zoomForBox(b, el.clientWidth || 390, el.clientHeight || 844, 13, 17),
            })
          })
          markers.push(new Marker({ element: btn, anchor: 'top', offset: [0, -17] }).setLngLat(lngLat).addTo(map))
        } else {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'cl'
          btn.setAttribute('aria-label', `${g.members.length}つの町`)
          btn.innerHTML = `<i>${g.members.length}</i>`
          const ll = map.unproject([g.x, g.y])
          btn.addEventListener('click', () => map.easeTo({ center: ll, zoom: Math.min(WORLD_MAX_ZOOM, map.getZoom() + 2) }))
          markers.push(new Marker({ element: btn, anchor: 'center' }).setLngLat([ll.lng, ll.lat]).addTo(map))
        }
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
    map.on('moveend', draw)
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
  }, [marks])

  const cleared = towns.filter((t) => t.clearedAt !== null).length
  return (
    <section className="wm" aria-label="ワールドマップ">
      <div ref={ref} className="wm-map" />
      <PlaceSearch
        onBack={onClose}
        onPick={(p) => onOpen({ name: p.title, center: { lat: p.lat, lng: p.lng }, zoom: 15 })}
      />
      <div className="wm-band" aria-label={`行った町 ${towns.length} クリア ${cleared}`}>
        <div className="cell"><b>{towns.length}</b><span>行った町</span></div>
        <div className="sep" />
        <div className="cell"><b>{cleared}</b><span>クリア</span></div>
      </div>
    </section>
  )
}
