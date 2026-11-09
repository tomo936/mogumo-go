import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.ts'
import { CreditsButton } from '../credits/CreditsButton.tsx'
import { LocationOverlay } from '../map/ui/LocationOverlay.tsx'
import { MapView } from '../map/ui/MapView.tsx'
import type { MapViewHandle } from '../map/ui/MapView.tsx'
import { distanceMeters } from '../map/domain/geo.ts'
import type { LatLng } from '../map/domain/geo.ts'
import { farFromHome } from '../checkin/domain/far.ts'
import { postCheckin } from '../checkin/infra/checkinApi.ts'
import { CheckinEffect } from '../checkin/ui/CheckinEffect.tsx'
import { BuildingSheet } from '../checkin/ui/BuildingSheet.tsx'
import { ShopSheet } from '../checkin/ui/ShopSheet.tsx'
import type { CheckinError } from '../checkin/ui/ShopSheet.tsx'
import type { Shop } from '../shops/domain/shop.ts'
import { shopSourceEnabled } from '../shops/infra/hotpepper.ts'
import { guideShops, hintPosition, matchesShop } from '../hints/domain/hint.ts'
import { ExploreButton } from '../hints/ui/ExploreButton.tsx'
import { ExploreSheet } from '../hints/ui/ExploreSheet.tsx'
import { HintSheet } from '../hints/ui/HintSheet.tsx'
import { RevealBanner } from '../hints/ui/RevealBanner.tsx'
import { useDailyHints } from '../hints/ui/useDailyHints.ts'
import { loadHome } from '../setup/infra/homeStore.ts'
import { nextStatus } from '../map/domain/locationStatus.ts'

const SHOPS_ERROR_BANNER_MS = 6000

export function MapPage() {
  const { session, signOut } = useAuth()
  const userId = session?.user.id
  const home = useMemo(() => (userId ? loadHome(userId) : null), [userId])
  const [shopsError, setShopsError] = useState(false)
  // 帯は数秒で消える
  useEffect(() => {
    if (!shopsError) return
    const t = setTimeout(() => setShopsError(false), SHOPS_ERROR_BANNER_MS)
    return () => clearTimeout(t)
  }, [shopsError])
  const [status, dispatch] = useReducer(nextStatus, 'searching')
  const [attempt, setAttempt] = useState(0)

  const mapRef = useRef<MapViewHandle>(null)
  const [selected, setSelected] = useState<Shop | null>(null)
  const [building, setBuilding] = useState<{ shops: Shop[]; checked: ReadonlySet<string>; title: string | null } | null>(null)
  const [me, setMe] = useState<LatLng | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkinError, setCheckinError] = useState<CheckinError | null>(null)
  const [effect, setEffect] = useState<{ coins: 0 | 30 | 40; reveal: string | null; key: number } | null>(null)
  const [doneToday, setDoneToday] = useState(false)
  const [exploreOpen, setExploreOpen] = useState(false)
  const [pickedHint, setPickedHint] = useState<string | null>(null)
  const hints = useDailyHints({
    userId: userId ?? '',
    enabled: shopSourceEnabled(import.meta.env.DEV, window.location.hostname),
    me,
    home,
    map: mapRef,
  })
  const busyRef = useRef(false)
  const effectSeq = useRef(0)
  const selectedRef = useRef<Shop | null>(null)
  useEffect(() => {
    selectedRef.current = selected
  })
  const closeHintSheet = hints.closeSheet
  const select = useCallback((shop: Shop | null) => {
    if (busyRef.current && shop) return // チェックイン中は別のお店にシートを入れ替えない（閉じるのは可）
    if (shop) {
      // シートは同時に1つ。探索・ヒントのシートは閉じる
      setExploreOpen(false)
      setPickedHint(null)
      closeHintSheet()
    }
    setSelected(shop)
    // 今日もうチェックインしたお店かは、板を開いたときに地図に聞いておく（描画中に ref を読まない）
    setDoneToday(shop ? (mapRef.current?.isCheckedToday(shop) ?? false) : false)
    setCheckinError(null)
    if (!shop) mapRef.current?.unfocus() // 板を閉じたらカメラを自分に戻す
  }, [closeHintSheet])

  // ビルの一覧（済みの印は開いたときに地図に聞いておく）
  const selectBuilding = useCallback((shops: Shop[] | null, title?: string | null) => {
    if (busyRef.current && shops) return
    setBuilding(shops ? { shops, checked: mapRef.current?.checked() ?? new Set<string>(), title: title ?? null } : null)
    if (shops) {
      setSelected(null)
      setExploreOpen(false)
      setPickedHint(null)
      closeHintSheet()
    }
  }, [closeHintSheet])

  // 探索シート
  const openExplore = () => {
    if (busyRef.current) return
    setSelected(null)
    setBuilding(null)
    setPickedHint(null)
    mapRef.current?.unfocus()
    setExploreOpen(true)
    hints.openSheet()
  }
  const closeExplore = () => {
    setExploreOpen(false)
    hints.closeSheet()
    mapRef.current?.unfocus()
  }
  // 気配を押した（ピンも、探索シートの行も同じ）。明かし済み・達成は店のシート、それ以外はカメラを寄せてヒントのシート
  const pickHint = (id: string) => {
    if (busyRef.current) return
    const h = hints.set?.hints.find((x) => x.id === id)
    if (!h) return
    const all = mapRef.current?.hintInputs()?.shops ?? []
    const at = hints.positions.get(id) ?? hintPosition(h, all)
    if (h.completed || hints.revealed.has(id)) {
      const found = all.find((s) => matchesShop(h, s))
      if (found) {
        mapRef.current?.focusAt(at)
        select(found)
        return
      }
    }
    setExploreOpen(false)
    setSelected(null)
    setBuilding(null)
    hints.closeSheet()
    setPickedHint(id)
    mapRef.current?.focusAt(at)
  }
  const closeHint = () => {
    setPickedHint(null)
    mapRef.current?.unfocus()
  }

  const checkin = async () => {
    if (!selected || !me || busyRef.current) return
    busyRef.current = true // 連打を state の反映より前に止める
    setBusy(true)
    setCheckinError(null)
    const posted = selected
    const maskedBefore = hints.isMasked(posted) // 伏せたままチェックインしたら、演出で正体を出す
    const result = await postCheckin({ shopId: posted.id, me, farFromHome: farFromHome(home, me), ...(posted.mapId ? { mapId: posted.mapId } : {}) })
    busyRef.current = false
    setBusy(false)
    if (result.ok) {
      setSelected((cur) => (cur?.id === posted.id ? null : cur))
      setEffect({ coins: result.coins, reveal: maskedBefore ? posted.name : null, key: ++effectSeq.current })
      if (result.wasHint) hints.markCompleted(posted)
      mapRef.current?.checkin(posted, result.newCells)
    } else {
      if (selectedRef.current?.id === posted.id) setCheckinError(result.reason)
    }
  }

  // 探索シート・ヒントのシートに出す、気配までの距離と、気配なしの日の案内
  const distances = useMemo(() => {
    const m = new Map<string, number>()
    if (me) for (const [id, p] of hints.positions) m.set(id, distanceMeters(me, p))
    return m
  }, [me, hints.positions])
  const pickedHintData = pickedHint ? (hints.set?.hints.find((h) => h.id === pickedHint) ?? null) : null
  const noHints = exploreOpen && hints.status === 'ready' && hints.set !== null && hints.set.hints.length === 0
  const guide = (() => {
    if (!noHints || !me) return []
    const inputs = mapRef.current?.hintInputs()
    if (!inputs) return []
    return guideShops(inputs.near, inputs.checked, me).map((shop) => ({ shop, distanceM: distanceMeters(me, shop) }))
  })()

  const retry = () => {
    dispatch({ type: 'retry' })
    setAttempt((n) => n + 1) // 地図と位置の監視を作り直す
  }

  return (
    <>
      <MapView
        key={attempt}
        ref={mapRef}
        onStatus={dispatch}
        home={home}
        onShopsError={() => setShopsError(true)}
        onSelectShop={select}
        onSelectBuilding={selectBuilding}
        onPosition={setMe}
        onHintTap={pickHint}
      />
      {building && !selected && (
        <BuildingSheet
          shops={building.shops}
          checkedIds={building.checked}
          maskedIds={new Set(building.shops.filter((x) => hints.isMasked(x)).map((x) => x.id))}
          hintIds={new Set(building.shops.filter((x) => hints.hintFor(x)).map((x) => x.id))}
          title={building.title}
          onPick={(shop) => {
            setBuilding(null)
            select(shop)
          }}
          onClose={() => {
            setBuilding(null)
            mapRef.current?.unfocus()
          }}
        />
      )}
      {selected && me && (
        <ShopSheet
          shop={selected}
          distanceM={distanceMeters(me, selected)}
          doneToday={doneToday}
          hint={hints.hintFor(selected)}
          masked={hints.isMasked(selected)}
          busy={busy}
          error={checkinError}
          onCheckin={() => void checkin()}
          onClose={() => select(null)}
        />
      )}
      {exploreOpen && (
        <ExploreSheet
          status={hints.status}
          set={hints.set}
          revealed={hints.revealed}
          distances={distances}
          regenVisible={hints.regenVisible}
          fast={hints.fast}
          notice={hints.notice}
          guide={guide}
          onPickHint={pickHint}
          onPickShop={(shop) => {
            mapRef.current?.focusAt(shop)
            select(shop)
          }}
          onRegen={hints.regen}
          onRetry={hints.retry}
          onClose={closeExplore}
        />
      )}
      {pickedHintData && (
        <HintSheet hint={pickedHintData} distanceM={distances.get(pickedHintData.id) ?? null} onClose={closeHint} />
      )}
      {hints.newlyRevealed && (
        <RevealBanner key={hints.newlyRevealed.id} name={hints.newlyRevealed.shop.name} onDone={hints.clearNewly} />
      )}
      {effect && <CheckinEffect key={effect.key} coins={effect.coins} reveal={effect.reveal} onDone={() => {
            setEffect(null)
            if (!selectedRef.current) mapRef.current?.unfocus() // 演出が終わったらカメラを自分に戻す
          }} />}
      <div className="map-overlay">
        <LocationOverlay status={status} onRetry={retry} onReload={() => window.location.reload()} />
        {shopsError && <p className="location-banner">お店を読み込めませんでした</p>}
        <div className="map-actions">
          <CreditsButton />
          <button type="button" onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
        {!exploreOpen && !pickedHint && !selected && !building && (
          <ExploreButton
            remaining={hints.set ? hints.set.hints.filter((h) => !h.completed).length : null}
            onClick={openExplore}
          />
        )}
        <a className="hp-credit" href="http://webservice.recruit.co.jp/" target="_blank" rel="noreferrer">
          Powered by ホットペッパーグルメ Webサービス
        </a>
      </div>
    </>
  )
}
