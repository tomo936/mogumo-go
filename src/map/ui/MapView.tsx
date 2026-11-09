import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import type { Ref } from 'react'
import { Map as MapLibreMap } from 'maplibre-gl'
import '../infra/maplibreWorker.ts'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './map.css'
import {
  CIRCLE_RADIUS_M, FIRST_FIX_TIMEOUT_MS, INITIAL_ZOOM, MAP_THEME, MAX_ZOOM, MIN_ZOOM, PITCH, STYLE_URL,
} from '../config.ts'
import { themeStyle } from '../infra/theme.ts'
import { pickTheme, THEMES } from '../infra/themes.ts'
import { isFakeWalkEnabled, startFakeWalk } from '../infra/fakeWalk.ts'
import { circlePolygon, distanceMeters } from '../domain/geo.ts'
import type { LatLng } from '../domain/geo.ts'
import { watchLocation } from '../infra/location.ts'
import type { LocationEvent } from '../domain/locationStatus.ts'
import { fetchHotpepperShops, shopSourceEnabled } from '../../shops/infra/hotpepper.ts'
import { loadProgress } from '../../checkin/infra/checkinApi.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import type { Cell } from '../../fog/domain/grid.ts'
import { createAvatar } from '../infra/avatarMarker.ts'
import { attachWorld } from './worldLayers.ts'
import { createHintPins } from '../../hints/infra/hintPins.ts'
import type { DailyHint } from '../../hints/domain/hint.ts'
import type { Visits } from '../../checkin/domain/visits.ts'
import '../../hints/ui/hints.css'
import { nextBearing } from '../domain/rotate.ts'
import { isStale, judgeFix, shouldMoveCamera, stepToward } from '../domain/smoothing.ts'
import type { Fix } from '../domain/smoothing.ts'

export type MapViewHandle = {
  checkin(shop: Shop, newCells: Cell[]): void
  unfocus(): void
  isCheckedToday(shop: Shop): boolean
  visitsFor(shop: Shop): Visits | null // わたしの記録（読み込み前・0回は null）
  progressReady(): boolean // 保存済みの記録を読み終えたか
  checked(): ReadonlySet<string>
  hintInputs(): ReturnType<ReturnType<typeof attachWorld>['hintInputs']> | null // 気配の候補集めの材料（地図ができる前は null）
  whenShopsReady(): Promise<void> // お店の読み込みがそろったら解ける
  setHints(hints: readonly DailyHint[], positions: ReadonlyMap<string, LatLng>, revealed: ReadonlySet<string>): void
  focusAt(p: LatLng): void // お店をタップしたときと同じカメラの寄せ。戻すのは unfocus
  bounceHint(hintId: string): void
}

type Props = {
  onStatus: (event: LocationEvent) => void
  home: LatLng | null
  onShopsError: () => void
  onSelectShop: (shop: Shop | null) => void
  onSelectBuilding: (shops: Shop[] | null, title?: string | null) => void // ビル・施設・駅（同じ建物の複数のお店）が押された。title は施設・駅の名前
  onPosition: (me: LatLng) => void // 1秒に4回まで
  onHintTap: (hintId: string) => void // 気配のピンが押された
  pinsHidden?: boolean // 店のピン（1軒・ビル・施設）と名前の札を出さない（気配のピンは出す）
  ref?: Ref<MapViewHandle>
}

const TAP_MAX_MOVE_PX = 10
const TAP_MAX_MS = 300
const POSITION_EVERY_MS = 250
const TAP_ZOOM_STEP = 0.6
const CHECKIN_WAVE_DELAY_MS = 900 // 紙吹雪のあと、霧の波が走り出すまで

// 地図・カメラ・位置は MapLibre と ref だけで持ち、React の再描画を起こさない。
// React に上げるのは位置情報の出来事（onStatus）だけ。
export function MapView({ onStatus, home, onShopsError, onSelectShop, onSelectBuilding, onPosition, onHintTap, pinsHidden = false, ref }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onStatusRef = useRef(onStatus)
  const onShopsErrorRef = useRef(onShopsError)
  const onSelectShopRef = useRef(onSelectShop)
  const onSelectBuildingRef = useRef(onSelectBuilding)
  const onPositionRef = useRef(onPosition)
  const onHintTapRef = useRef(onHintTap)
  const worldRef = useRef<ReturnType<typeof attachWorld> | null>(null)
  const pinsHiddenRef = useRef(pinsHidden) // 世界ができる前に決まっていた分も、できたときに渡す
  useEffect(() => {
    pinsHiddenRef.current = pinsHidden
    worldRef.current?.setPinsVisible(!pinsHidden)
  }, [pinsHidden])
  useLayoutEffect(() => {
    onStatusRef.current = onStatus
    onShopsErrorRef.current = onShopsError
    onSelectShopRef.current = onSelectShop
    onSelectBuildingRef.current = onSelectBuilding
    onPositionRef.current = onPosition
    onHintTapRef.current = onHintTap
  })
  // チェックイン演出: 約0.9秒後に済みの印を付け、新しく晴れるセルを足して波を走らせる（外すときに取り消す）
  const checkinTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
  // お店の板を開いている間は、カメラをそのお店に向けて、自分への追いかけを止める
  const focusRef = useRef<{ lat: number; lng: number } | null>(null)
  const unfocusRef = useRef<() => void>(() => {})
  const tapRef = useRef<(ids: string[] | null) => void>(() => {})
  const focusAtRef = useRef<(p: LatLng) => void>(() => {})
  // 気配のピン。最後に渡された内容は覚えておき、地図を作り直したときに出し直す
  const hintPinsRef = useRef<ReturnType<typeof createHintPins> | null>(null)
  const lastHintsRef = useRef<Parameters<MapViewHandle['setHints']> | null>(null)
  // お店の読み込みがそろうのを待つ口。そろう前に地図を作り直しても、待っている人はそのまま待てる
  const readyRef = useRef<{ promise: Promise<void>; resolve: () => void; done: boolean } | null>(null)
  const newReady = () => {
    let resolve!: () => void
    const promise = new Promise<void>((r) => { resolve = r })
    readyRef.current = { promise, resolve, done: false }
  }
  if (!readyRef.current) newReady()
  useImperativeHandle(ref, () => ({
    unfocus: () => unfocusRef.current(),
    isCheckedToday: (shop) => worldRef.current?.checkedToday(shop) ?? false,
    visitsFor: (shop) => worldRef.current?.visitsFor(shop) ?? null,
    progressReady: () => worldRef.current?.progressReady() ?? false,
    checked: () => worldRef.current?.checked() ?? new Set<string>(),
    hintInputs: () => worldRef.current?.hintInputs() ?? null,
    whenShopsReady: () => readyRef.current!.promise,
    setHints: (hints, positions, revealed) => {
      lastHintsRef.current = [hints, positions, revealed]
      hintPinsRef.current?.update(hints, positions, revealed)
    },
    focusAt: (p) => focusAtRef.current(p),
    bounceHint: (id) => hintPinsRef.current?.bounce(id),
    checkin: (shop, newCells) => {
      const t = setTimeout(() => {
        checkinTimers.current.delete(t)
        worldRef.current?.markChecked(shop.id, shop.mapId)
        worldRef.current?.addCleared(newCells, shop)
      }, CHECKIN_WAVE_DELAY_MS)
      checkinTimers.current.add(t)
    },
  }), [])
  useEffect(() => {
    const timers = checkinTimers.current
    return () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current!
    // 色の案は標準（MAP_THEME）。見比べたいときだけ URL の ?theme= で選ぶ
    const theme = THEMES[pickTheme(window.location.search, MAP_THEME)]
    container.style.visibility = 'hidden' // 最初の位置が取れるまで地図は見せない
    const map = new MapLibreMap({
      container,
      style: STYLE_URL,
      transformStyle: (_prev, next) => themeStyle(next, theme),
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
      attributionControl: false, // 出典は起動時のスプラッシュと「出典」ボタンで示す
    })
    map.touchZoomRotate.disableRotation()
    if (readyRef.current!.done) newReady()
    const hintPins = createHintPins(map, (id) => onHintTapRef.current(id))
    hintPinsRef.current = hintPins
    if (lastHintsRef.current) hintPins.update(...lastHintsRef.current)

    const avatar = createAvatar(map) // 自分のアバター（お試し版）

    // 位置: target が最新の目標、current が画面に出している位置、drawn がサークルを描いた位置
    const s: {
      loaded: boolean; target: LatLng | null; current: LatLng | null; lastFix: Fix | null
      drawn: LatLng | null; shown: LatLng | null; acceptedAt: number; rejectedAt: number | null
      world: ReturnType<typeof attachWorld> | null
    } = { loaded: false, target: null, current: null, lastFix: null, drawn: null, shown: null, acceptedAt: 0, rejectedAt: null, world: null }
    map.on('load', () => {
      map.addSource('me-circle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('me-shadow', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'me-circle-fill', type: 'fill', source: 'me-circle', paint: { 'fill-color': '#4aa8ff', 'fill-opacity': 0.15 } })
      map.addLayer({ id: 'me-circle-line', type: 'line', source: 'me-circle', paint: { 'line-color': '#4aa8ff', 'line-width': 2, 'line-opacity': 0.6 } })
      map.addLayer({
        id: 'me-shadow', type: 'circle', source: 'me-shadow',
        paint: { 'circle-radius': 10, 'circle-color': '#1f2a37', 'circle-opacity': 0.25, 'circle-pitch-alignment': 'map' },
      })
      s.world = attachWorld(map, {
        home,
        fetchHotpepper: fetchHotpepperShops,
        shopsEnabled: shopSourceEnabled(import.meta.env.DEV, window.location.hostname),
        onShopsError: () => onShopsErrorRef.current(),
        loadProgress,
        onPinTap: (ids) => tapRef.current(ids),
        onShopsReady: () => {
          const r = readyRef.current!
          r.done = true
          r.resolve()
        },
      })
      worldRef.current = s.world
      s.world.setPinsVisible(!pinsHiddenRef.current)
      if (s.current) s.world.onPosition(s.current)
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
      ? startFakeWalk(onFix, home ?? undefined)
      : watchLocation(onFix, (failure) => onStatusRef.current({ type: 'failure', failure }))

    // 1本指の横なぞりで回す（2本指のときはピンチのズームに任せる）
    const pointers = new Map<number, number>()
    // タップの判定用: 押した位置・時刻と、途中で2本目が触れたか
    const downs = new Map<number, { x: number; y: number; t: number; multi: boolean }>()
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, e.clientX)
      downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), multi: false })
      if (pointers.size >= 2) for (const d of downs.values()) d.multi = true
    }
    const onMove = (e: PointerEvent) => {
      const prevX = pointers.get(e.pointerId)
      if (prevX === undefined) return
      pointers.set(e.pointerId, e.clientX)
      if (pointers.size === 1) map.setBearing(nextBearing(map.getBearing(), e.clientX - prevX))
    }
    const onUp = (e: PointerEvent) => {
      const d = downs.get(e.pointerId)
      downs.delete(e.pointerId)
      pointers.delete(e.pointerId)
      if (e.type !== 'pointerup' || !d || d.multi || !s.world) return
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_MAX_MOVE_PX || performance.now() - d.t > TAP_MAX_MS) return
      const rect = container.getBoundingClientRect()
      tapRef.current(s.world.pick({ x: e.clientX - rect.left, y: e.clientY - rect.top }))
    }
    // 建物かピンが押された: 1軒ならお店のシート、2軒以上ならビルの一覧。カメラはそのお店（ビルなら先頭の店）へ寄せる
    tapRef.current = (ids) => {
      const found = (ids ?? []).map((id) => s.world?.shopsNear().find((sh) => sh.id === id)).filter((sh): sh is Shop => !!sh)
      // 建物でもピンでもない所（道路など）を押したときは何もしない。押しまちがいでシートが閉じたり、
      // カメラが自分に戻ったりしないように（2026-11-09 本人）。閉じるのはシートの × で
      if (found.length === 0) return
      if (found.length > 1) {
        // お店のシートは一覧側で閉じる（ここで onSelectShop(null) を呼ぶとカメラの寄せが外れ、タップのたびにズームが進む）
        onSelectBuildingRef.current(found, s.world?.titleOf(found.map((sh) => sh.id)) ?? null)
      } else {
        onSelectBuildingRef.current(null)
        onSelectShopRef.current(found[0] ?? null)
      }
      const at = found[0]
      if (at) {
        const zoom = focusRef.current ? map.getZoom() : Math.min(map.getZoom() + TAP_ZOOM_STEP, MAX_ZOOM)
        focusRef.current = { lat: at.lat, lng: at.lng }
        s.world?.focus(found.map((sh) => sh.id)) // 選んだ建物は遠くても詳しい模型に
        map.easeTo({ center: [at.lng, at.lat], zoom, duration: 500 })
      }
    }
    // 気配を押したとき: カメラをその場所へ寄せる（お店のシートを開くときと同じ動き）
    focusAtRef.current = (p) => {
      const zoom = focusRef.current ? map.getZoom() : Math.min(map.getZoom() + TAP_ZOOM_STEP, MAX_ZOOM)
      focusRef.current = { lat: p.lat, lng: p.lng }
      map.easeTo({ center: [p.lng, p.lat], zoom, duration: 500 })
    }
    // 板を閉じたら、カメラを自分に戻して追いかけを再開する
    unfocusRef.current = () => {
      if (!focusRef.current) return
      focusRef.current = null
      s.shown = null
      s.world?.focus(null)
      if (s.current) map.easeTo({ center: [s.current.lng, s.current.lat], duration: 500 })
    }
    // 毎コマ、表示位置を目標へ寄せてカメラを動かす
    const loop = { frame: 0, prevTime: performance.now(), positionAt: 0 }
    const tick = (now: number) => {
      const dt = now - loop.prevTime
      loop.prevTime = now
      if (s.current && s.target) {
        const c = stepToward(s.current, s.target, dt)
        s.current = c
        s.world?.onPosition(c)
        avatar.update(c, dt)
        if (now - loop.positionAt >= POSITION_EVERY_MS) {
          loop.positionAt = now
          onPositionRef.current(c)
        }
        if (!focusRef.current && shouldMoveCamera(s.shown, c, pointers.size >= 2 || map.isZooming())) {
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
      avatar.dispose()
      clearTimeout(firstFixTimer)
      clearInterval(staleTimer)
      stopWatch()
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      worldRef.current = null
      hintPins.dispose()
      hintPinsRef.current = null
      s.world?.dispose()
      map.remove()
    }
  }, [home])

  return <div ref={containerRef} data-testid="map-view" className="map-view" />
}
