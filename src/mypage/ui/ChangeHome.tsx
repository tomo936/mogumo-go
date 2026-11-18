// 自宅の場所を変える（マイページから。SPEC S15）。初回設定と同じ地図で家の印を合わせて保存する。
// 自宅はこの端末の中だけに保存する（サーバーには送らない）。保存したら地図・霧を読み直す。
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocationStatus } from '../../map/domain/locationStatus.ts'
import { LocationOverlay } from '../../map/ui/LocationOverlay.tsx'
import type { Home } from '../../setup/domain/home.ts'
import { getCurrentLocation } from '../../setup/infra/currentLocation.ts'
import { saveHome } from '../../setup/infra/homeStore.ts'
import { HomePickerMap } from '../../setup/ui/HomePickerMap.tsx'
import '../../map/ui/map.css'
import '../../setup/ui/setup.css'

type Locate = { status: Exclude<LocationStatus, 'waiting'>; start: Home | null }

export function ChangeHome({ userId, onSaved, onCancel }: { userId: string; onSaved: () => void; onCancel: () => void }) {
  const [locate, setLocate] = useState<Locate>({ status: 'searching', start: null })
  const [attempt, setAttempt] = useState(0)
  const [recenter, setRecenter] = useState(0)
  const center = useRef<Home | null>(null)

  useEffect(() => {
    let active = true
    getCurrentLocation().then(
      (start) => { if (active) setLocate({ status: 'tracking', start }) },
      (failure) => { if (active) setLocate({ status: failure === 'denied' ? 'denied' : 'notFound', start: null }) },
    )
    return () => { active = false }
  }, [attempt])

  const onCenterChange = useCallback((c: Home) => { center.current = c }, [])

  const confirm = () => {
    if (!center.current) return
    saveHome(userId, center.current)
    onSaved()
  }

  return (
    <main className="setup-page setup-home mp-home" aria-label="自宅の場所を変える">
      <button type="button" className="setup-back" onClick={onCancel}>戻る</button>
      <h1>自宅の場所を変える</h1>
      <p className="setup-note">地図を動かして、家の印を自宅に合わせてください。自宅の場所はこのスマホの中だけに保存します</p>
      <div className="setup-map">
        {locate.start && <HomePickerMap start={locate.start} recenter={recenter} onCenterChange={onCenterChange} />}
        <LocationOverlay
          status={locate.status}
          onRetry={() => {
            setLocate({ status: 'searching', start: null })
            setAttempt((n) => n + 1)
          }}
          onReload={() => window.location.reload()}
        />
      </div>
      <div className="setup-actions">
        <button type="button" onClick={() => setRecenter((n) => n + 1)} disabled={!locate.start}>現在地へ</button>
        <button type="button" onClick={confirm} disabled={!locate.start}>ここを自宅にする</button>
      </div>
    </main>
  )
}
