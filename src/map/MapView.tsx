import { useEffect, useLayoutEffect, useRef } from 'react'
import { Map as MapLibreMap } from 'maplibre-gl'
import './maplibreWorker.ts'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './map.css'
import {
  CIRCLE_RADIUS_M, FIRST_FIX_TIMEOUT_MS, INITIAL_ZOOM, MAX_ZOOM, MIN_ZOOM, PITCH, STYLE_URL,
} from './config.ts'
import { isFakeWalkEnabled, startFakeWalk } from './fakeWalk.ts'
import { circlePolygon, distanceMeters } from './geo.ts'
import type { LatLng } from './geo.ts'
import { watchLocation } from './location.ts'
import type { LocationEvent } from './locationStatus.ts'
import { nextBearing } from './rotate.ts'
import { isStale, judgeFix, shouldMoveCamera, stepToward } from './smoothing.ts'
import type { Fix } from './smoothing.ts'

type Props = { onStatus: (event: LocationEvent) => void }

// 地図・カメラ・位置は MapLibre と ref だけで持ち、React の再描画を起こさない。
// React に上げるのは位置情報の出来事（onStatus）だけ。
export function MapView({ onStatus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onStatusRef = useRef(onStatus)
  useLayoutEffect(() => {
    onStatusRef.current = onStatus
  })

  useEffect(() => {
    const container = containerRef.current!
    container.style.visibility = 'hidden' // 最初の位置が取れるまで地図は見せない
    const map = new MapLibreMap({
      container,
      style: STYLE_URL,
      pitch: PITCH,
      zoom: INITIAL_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      dragPan: false,
      dragRotate: false,
      keyboard: false,
      doubleClickZoom: false,
      touchPitch: false,
      pitchWithRotate: false,
      scrollZoom: { around: 'center' },
      touchZoomRotate: { around: 'center' },
      attributionControl: { compact: false },
    })
    map.touchZoomRotate.disableRotation()

    // 位置: target が最新の目標、current が画面に出している位置、drawn がサークルを描いた位置
    const s: {
      loaded: boolean; target: LatLng | null; current: LatLng | null; lastFix: Fix | null
      drawn: LatLng | null; shown: LatLng | null; acceptedAt: number; rejectedAt: number | null
    } = { loaded: false, target: null, current: null, lastFix: null, drawn: null, shown: null, acceptedAt: 0, rejectedAt: null }
    map.on('load', () => {
      map.addSource('me-circle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('me-shadow', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'me-circle-fill', type: 'fill', source: 'me-circle', paint: { 'fill-color': '#4aa8ff', 'fill-opacity': 0.15 } })
      map.addLayer({ id: 'me-circle-line', type: 'line', source: 'me-circle', paint: { 'line-color': '#4aa8ff', 'line-width': 2, 'line-opacity': 0.6 } })
      map.addLayer({
        id: 'me-shadow', type: 'circle', source: 'me-shadow',
        paint: { 'circle-radius': 10, 'circle-color': '#1f2a37', 'circle-opacity': 0.25, 'circle-pitch-alignment': 'map' },
      })
      s.loaded = true
      s.drawn = null
    })

    const firstFixTimer = setTimeout(() => {
      if (!s.lastFix) onStatusRef.current({ type: 'firstFixTimeout' })
    }, FIRST_FIX_TIMEOUT_MS)
    // 精度の悪い測位ばかりで、使える測位が SNAP_GAP_MS 来なければ「待っています」の帯を出す
    const staleTimer = setInterval(() => {
      if (s.lastFix && isStale(s.acceptedAt, s.rejectedAt, Date.now())) onStatusRef.current({ type: 'failure', failure: 'timeout' })
    }, 1000)

    const onFix = (fix: Fix) => {
      const verdict = judgeFix(fix, s.lastFix)
      if (verdict === 'reject') {
        s.rejectedAt = Date.now()
        return
      }
      s.lastFix = fix
      s.acceptedAt = Date.now()
      s.target = { lat: fix.lat, lng: fix.lng }
      if (verdict === 'snap' || !s.current) s.current = s.target
      container.style.visibility = 'visible'
      onStatusRef.current({ type: 'fix' })
    }
    const stopWatch = isFakeWalkEnabled(window.location.search, import.meta.env.DEV)
      ? startFakeWalk(onFix)
      : watchLocation(onFix, (failure) => onStatusRef.current({ type: 'failure', failure }))

    // 1本指の横なぞりで回す（2本指のときはピンチのズームに任せる）
    const pointers = new Map<number, number>()
    const onDown = (e: PointerEvent) => pointers.set(e.pointerId, e.clientX)
    const onMove = (e: PointerEvent) => {
      const prevX = pointers.get(e.pointerId)
      if (prevX === undefined) return
      pointers.set(e.pointerId, e.clientX)
      if (pointers.size === 1) map.setBearing(nextBearing(map.getBearing(), e.clientX - prevX))
    }
    const onUp = (e: PointerEvent) => pointers.delete(e.pointerId)
    // 毎コマ、表示位置を目標へ寄せてカメラを動かす
    const loop = { frame: 0, prevTime: performance.now() }
    const tick = (now: number) => {
      const dt = now - loop.prevTime
      loop.prevTime = now
      if (s.current && s.target) {
        const c = stepToward(s.current, s.target, dt)
        s.current = c
        if (shouldMoveCamera(s.shown, c, pointers.size >= 2 || map.isZooming())) {
          map.jumpTo({ center: [c.lng, c.lat] })
          s.shown = c
        }
        if (s.loaded && (!s.drawn || distanceMeters(s.drawn, c) > 0.01)) {
          ;(map.getSource('me-circle') as GeoJSONSource).setData(circlePolygon(c, CIRCLE_RADIUS_M))
          ;(map.getSource('me-shadow') as GeoJSONSource).setData({ type: 'Point', coordinates: [c.lng, c.lat] })
          s.drawn = c
        }
      }
      loop.frame = requestAnimationFrame(tick)
    }
    loop.frame = requestAnimationFrame(tick)

    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    return () => {
      cancelAnimationFrame(loop.frame)
      clearTimeout(firstFixTimer)
      clearInterval(staleTimer)
      stopWatch()
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      map.remove()
    }
  }, [])

  return <div ref={containerRef} data-testid="map-view" className="map-view" />
}
