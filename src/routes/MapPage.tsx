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
import type { CheckinResult } from '../checkin/infra/checkinApi.ts'
import { ShopSheet } from '../checkin/ui/ShopSheet.tsx'
import type { CheckinError } from '../checkin/ui/ShopSheet.tsx'
import type { Shop } from '../shops/domain/shop.ts'
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
  const [me, setMe] = useState<LatLng | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkinError, setCheckinError] = useState<CheckinError | null>(null)
  const [, setLastCheckin] = useState<Extract<CheckinResult, { ok: true }> | null>(null) // Task 11 の演出で使う
  const busyRef = useRef(false)
  const select = useCallback((shop: Shop | null) => {
    setSelected(shop)
    setCheckinError(null)
  }, [])

  const checkin = async () => {
    if (!selected || !me || busyRef.current) return
    busyRef.current = true // 連打を state の反映より前に止める
    setBusy(true)
    setCheckinError(null)
    const result = await postCheckin({ shopId: selected.id, me, farFromHome: farFromHome(home, me) })
    busyRef.current = false
    setBusy(false)
    if (result.ok) {
      setLastCheckin(result)
      setSelected(null)
      mapRef.current?.checkin(selected.id)
    } else {
      setCheckinError(result.reason)
    }
  }

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
        onPosition={setMe}
      />
      {selected && me && (
        <ShopSheet
          shop={selected}
          distanceM={distanceMeters(me, selected)}
          busy={busy}
          error={checkinError}
          onCheckin={() => void checkin()}
          onClose={() => select(null)}
        />
      )}
      <div className="map-overlay">
        <LocationOverlay status={status} onRetry={retry} onReload={() => window.location.reload()} />
        {shopsError && <p className="location-banner">お店を読み込めませんでした</p>}
        <div className="map-actions">
          <CreditsButton />
          <button type="button" onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
      </div>
    </>
  )
}
