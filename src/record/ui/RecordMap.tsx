// 記録の地図: 本物の地図を真上から見て、その上にアプリの地図と同じ雲を重ねる。
// スライダーの日付までに晴れたマスだけを「晴れた場所」にして、雲を作り直す。中心は自宅。
// クリアした町は、クリアした日から町の形の中がぜんぶ晴れる（マスは雲を置く範囲の分だけ、その場で計算する）。
import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
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
import { FAR_HALF_M, MAX_ZOOM, MIN_ZOOM, REBUILD_M, clearedBox, inBox, viewOf, zoomFor } from '../domain/view.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import { cellCenter } from '../../fog/domain/grid.ts'
import type { DayPin } from '../domain/dayPins.ts'
import { PIN_ICON } from '../../shops/infra/pinIcons.ts'
import { cellsInTown } from '../../towns/domain/shape.ts'
import type { ClearedTown } from '../../towns/domain/shape.ts'
import { inView, labelCollection, lineCollection } from '../../towns/domain/outline.ts'
import type { OutlineTown } from '../../towns/domain/outline.ts'

type Props = {
  cells: ClearedCell[]
  towns: ClearedTown[]
  t: number
  home: LatLng | null
  pins: DayPin[]
  wave?: boolean
  outlines?: OutlineTown[] // 「町の範囲」を出すとき、行った町の形（出さないときは空）
  focus?: { center: LatLng; zoom: number } // 指定すると、最初の視点をここにする（ワールドマップから飛んだ先）
  onPinTap?: (shopId: string) => void // 指定すると、ピンを押したら札ではなくこれを呼ぶ
}

const NO_OUTLINES: OutlineTown[] = []
const DONE_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#fff"/><circle cx="12" cy="12" r="10.1" fill="#3ecf8e"/><path d="M7.4 12.2l3.6 3.6 6-6.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const mdLabel = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`

export function RecordMap({ cells, towns, t, home, pins, wave = true, outlines = NO_OUTLINES, focus, onPinTap }: Props) {
  const onPinTapRef = useRef(onPinTap)
  onPinTapRef.current = onPinTap
  const waveRef = useRef(wave) // 晴れる動き（波）を出すか。スライダーを引いているときは出さずにすぐ反映する
  waveRef.current = wave
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false) // 地図の準備ができてからピンを置く（前に置くと左上に出る）
  const apply = useRef<(t: number) => void>(() => {})
  const applyTowns = useRef<(towns: ClearedTown[]) => void>(() => {})
  const applyOutlines = useRef<(list: OutlineTown[]) => void>(() => {})

  // 地図は最初に1回だけ作る（日付は apply で変える）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const view = viewOf(cells, home)
    const center = focus ? focus.center : view.center
    const radiusM = view.radiusM
    const theme = THEMES[pickTheme(window.location.search, MAP_THEME)]
    const map = new MapLibreMap({
      container,
      style: STYLE_URL,
      transformStyle: (_prev, next) => themeStyle(next, theme),
      center: [center.lng, center.lat],
      zoom: focus ? focus.zoom : zoomFor(radiusM, container.clientWidth || 360, center.lat),
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
    // 雲は origin のまわり 3km に置く。地図を 1.5km 以上動かしたら、そこを中心に置き直す（どこまでも動かせる）。
    // 晴れた場所から遠い雲は晴れ方で変わらないので、晴れていない前提で1回だけ作る。
    // スライダーで作り直すのは、晴れた場所のまわりの四角（box）の中だけ
    const points = [...(home ? [home] : []), ...cells.map(cellCenter)]
    let origin = center
    let plain: Clump[] = []
    let box: ReturnType<typeof clearedBox> = null
    let townList = towns
    let townCells: { at: number; keys: string[] }[] = [] // 町ごとの、雲を置く範囲に入るマス（クリアの時刻つき）
    const rebuildBase = () => {
      plain = fogClumps(origin, new Set(), FAR_HALF_M)
      const inTowns = townList.map((town) => ({ at: town.at, cells: cellsInTown(town, origin, FAR_HALF_M) }))
      townCells = inTowns.map((c) => ({ at: c.at, keys: c.cells.map(cellKey) }))
      box = clearedBox([...points, ...inTowns.flatMap((c) => c.cells.map(cellCenter))], origin, FAR_HALF_M)
    }
    rebuildBase()
    let last: Clump[] = []
    let ready = false
    let pending: number | null = null
    let shown = t
    const draw = (time: number) => {
      shown = time
      const cleared = new Set(base)
      for (const c of clearedAt(cells, time)) cleared.add(cellKey(c))
      for (const town of townCells) if (town.at <= time) for (const k of town.keys) cleared.add(k)
      const b = box
      const next = b ? fogClumps(origin, cleared, FAR_HALF_M, b) : []
      const rest = b ? plain.filter((c) => !inBox(c, b)) : plain
      if (waveRef.current && last.length > 0 && next.length < last.length) {
        // 晴れるときは、中心から外へ向かって雲が縮んで消える
        fog.setClumps(origin, [...waveClumps(last, next, localFrame(origin).to(center), performance.now() / 1000), ...rest])
      } else {
        fog.setClumps(origin, [...next, ...rest])
      }
      last = next
      map.triggerRepaint()
    }
    map.on('moveend', () => {
      if (!ready) return
      const c = map.getCenter()
      const here = { lat: c.lat, lng: c.lng }
      if (distanceMeters(here, origin) < REBUILD_M) return
      origin = here
      rebuildBase()
      last = []
      draw(shown)
    })
    apply.current = (time) => {
      if (!ready) return
      if (pending !== null) cancelAnimationFrame(pending)
      pending = requestAnimationFrame(() => {
        pending = null
        draw(time)
      })
    }
    // 開いているあいだに町をクリアしたとき: 町のマスを作り直して描き直す
    applyTowns.current = (list) => {
      if (list === townList) return
      townList = list
      rebuildBase()
      if (ready) draw(shown)
    }
    // 町の範囲: 見えている範囲の町だけを線と名前にして、雲の上に重ねる（クリア = 橙の実線、途中 = 茶色の点線）
    let outlineList: OutlineTown[] = []
    const drawOutlines = () => {
      const lines = map.getSource('town-lines')
      const labels = map.getSource('town-labels')
      if (!lines || !labels) return
      const b = map.getBounds()
      const seen = inView(outlineList, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
      ;(lines as GeoJSONSource).setData(lineCollection(seen) as never)
      ;(labels as GeoJSONSource).setData(labelCollection(seen) as never)
    }
    applyOutlines.current = (list) => {
      outlineList = list
      drawOutlines()
    }
    map.on('moveend', drawOutlines)
    map.on('load', () => {
      map.addLayer(fog)
      map.addSource('town-lines', { type: 'geojson', data: lineCollection([]) as never })
      map.addSource('town-labels', { type: 'geojson', data: labelCollection([]) as never })
      // 白いふち取り（細かい地図の上でも線が見えるように）
      map.addLayer({
        id: 'town-lines-edge',
        type: 'line',
        source: 'town-lines',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#fffdf7', 'line-width': 5.5, 'line-opacity': 0.75 },
      })
      map.addLayer({
        id: 'town-lines-done',
        type: 'line',
        source: 'town-lines',
        filter: ['==', ['get', 'cleared'], true],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#c2652a', 'line-width': 2.5, 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'town-lines-going',
        type: 'line',
        source: 'town-lines',
        filter: ['==', ['get', 'cleared'], false],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#6b5239', 'line-width': 2.4, 'line-dasharray': [2, 1.6], 'line-opacity': 0.95 },
      })
      map.addLayer({
        id: 'town-names',
        type: 'symbol',
        source: 'town-labels',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 14, 'text-max-width': 7, 'text-allow-overlap': false },
        paint: { 'text-color': ['case', ['get', 'cleared'], '#a24d18', '#6b5239'], 'text-halo-color': '#fffdf7', 'text-halo-width': 2 },
      })
      drawOutlines()
      ready = true
      draw(t)
      setLoaded(true)
    })
    return () => {
      if (pending !== null) cancelAnimationFrame(pending)
      apply.current = () => {}
      applyTowns.current = () => {}
      applyOutlines.current = () => {}
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
  useEffect(() => {
    if (focus) mapRef.current?.jumpTo({ center: [focus.center.lng, focus.center.lat], zoom: focus.zoom })
  }, [focus?.center.lat, focus?.center.lng, focus?.zoom]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    applyTowns.current(towns)
  }, [towns])
  useEffect(() => {
    applyOutlines.current(outlines)
  }, [outlines, loaded])

  // 行ったお店のピン（スライダーの日のお店は大きく番号つき）。押すと店名と日付の札。
  // ピンは作り直さない（作り直すと、置き直すまでの一瞬だけ地図の左上に出て、ピンが跳ねて見える）。
  // 店ごとに1つ作って残し、大きさ・番号・札だけを入れかえる。
  const markersRef = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement; num: HTMLElement; tag: HTMLElement; today: boolean }>())
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const markers = markersRef.current
    const keep = new Set(pins.map((p) => p.shopId))
    for (const [id, m] of markers) {
      if (!keep.has(id)) {
        m.marker.remove()
        markers.delete(id)
      }
    }
    for (const p of pins) {
      let m = markers.get(p.shopId)
      if (!m) {
        const el = document.createElement('button')
        el.type = 'button'
        // 動き（ぴょん）は中身にだけかける。外側の el には MapLibre が地図の上の位置を transform で入れるので、
        // el の大きさを変えると位置まで縮んで、地図の左上から飛んでくるように見える
        const body = document.createElement('span')
        body.className = 'rc-pin__body'
        const img = document.createElement('img')
        img.src = PIN_ICON[p.kind]
        img.alt = ''
        const num = document.createElement('b')
        num.className = 'rc-pin__num'
        body.append(img, num)
        if (onPinTapRef.current) {
          // 見るだけの地図では、行ったお店に済みの印（DoneMark と同じ形）
          const done = document.createElement('span')
          done.className = 'rc-pin__done'
          done.innerHTML = DONE_SVG
          body.append(done)
        }
        const tag = document.createElement('span')
        tag.className = 'rc-pin__tag'
        tag.hidden = true
        el.append(body, tag)
        el.addEventListener('click', () => {
          if (onPinTapRef.current) {
            onPinTapRef.current(p.shopId)
            return
          }
          const show = tag.hidden
          for (const other of markers.values()) other.tag.hidden = true
          tag.hidden = !show
        })
        // 置き場所が決まるまでは隠す（iPhone では最初の一瞬だけ左上に見えるため）。決まったら、その場所からぴょんと出す
        el.style.visibility = 'hidden'
        const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            el.style.visibility = ''
            body.classList.add('rc-pin__body--pop')
          }),
        )
        m = { marker, el, num, tag, today: true }
        markers.set(p.shopId, m)
      }
      if (!m.el.classList.contains('rc-pin')) m.el.classList.add('rc-pin', 'rc-pin--today')
      m.el.setAttribute('aria-label', `${p.name} ${mdLabel(p.lastDay)}`)
      m.num.textContent = p.order !== null ? String(p.order) : ''
      m.num.hidden = p.order === null
      m.tag.textContent = `${p.name} ・ ${mdLabel(p.lastDay)}`
    }
  }, [pins, loaded])
  useEffect(() => {
    const markers = markersRef.current
    return () => {
      for (const m of markers.values()) m.marker.remove()
      markers.clear()
    }
  }, [])

  return <div ref={containerRef} className="rc-map" role="img" aria-label="自宅を中心にした、晴れた場所と雲の地図（真上から）" />
}
