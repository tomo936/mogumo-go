import { useReducer, useState } from 'react'
import { useAuth } from '../auth/AuthContext.ts'
import { CreditsButton } from '../credits/CreditsButton.tsx'
import { LocationOverlay } from '../map/LocationOverlay.tsx'
import { MapView } from '../map/MapView.tsx'
import { nextStatus } from '../map/locationStatus.ts'

export function MapPage() {
  const { signOut } = useAuth()
  const [status, dispatch] = useReducer(nextStatus, 'searching')
  const [attempt, setAttempt] = useState(0)

  const retry = () => {
    dispatch({ type: 'retry' })
    setAttempt((n) => n + 1) // 地図と位置の監視を作り直す
  }

  return (
    <>
      <MapView key={attempt} onStatus={dispatch} />
      <div className="map-overlay">
        <LocationOverlay status={status} onRetry={retry} onReload={() => window.location.reload()} />
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
