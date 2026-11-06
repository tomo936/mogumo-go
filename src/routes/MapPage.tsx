import { useEffect, useMemo, useReducer, useState } from 'react'
import { useAuth } from '../auth/AuthContext.ts'
import { CreditsButton } from '../credits/CreditsButton.tsx'
import { LocationOverlay } from '../map/ui/LocationOverlay.tsx'
import { MapView } from '../map/ui/MapView.tsx'
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

  const retry = () => {
    dispatch({ type: 'retry' })
    setAttempt((n) => n + 1) // 地図と位置の監視を作り直す
  }

  return (
    <>
      <MapView key={attempt} onStatus={dispatch} home={home} onShopsError={() => setShopsError(true)} />
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
