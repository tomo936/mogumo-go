import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthContext.ts'
import type { LocationStatus } from '../../map/domain/locationStatus.ts'
import { LocationOverlay } from '../../map/ui/LocationOverlay.tsx'
import type { Home } from '../domain/home.ts'
import { getCurrentLocation } from '../infra/currentLocation.ts'
import { clearDraft, loadDraft } from '../infra/draftStore.ts'
import { saveHome } from '../infra/homeStore.ts'
import { profileRepo } from '../infra/profileRepo.ts'
import { HomePickerMap } from './HomePickerMap.tsx'
import { useSetupStatus } from './SetupStatusContext.ts'
import '../../map/ui/map.css'
import './setup.css'

type Locate = { status: Exclude<LocationStatus, 'waiting'>; start: Home | null }

export function HomePage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const status = useSetupStatus()
  const [draft] = useState(loadDraft)
  const [locate, setLocate] = useState<Locate>({ status: 'searching', start: null })
  const [attempt, setAttempt] = useState(0)
  const [recenter, setRecenter] = useState(0)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const center = useRef<Home | null>(null)
  const busy = useRef(false)

  // 現在地は出発点として1回だけ取る（追いかけ続けない）
  useEffect(() => {
    let active = true
    getCurrentLocation().then(
      (start) => { if (active) setLocate({ status: 'tracking', start }) },
      (failure) => { if (active) setLocate({ status: failure === 'denied' ? 'denied' : 'notFound', start: null }) },
    )
    return () => { active = false }
  }, [attempt])

  const onCenterChange = useCallback((c: Home) => { center.current = c }, [])

  if (!status.hasProfile && !draft.nickname) return <Navigate to="/setup/name" replace />
  if (!status.hasProfile && !draft.starterId) return <Navigate to="/setup/character" replace />

  const confirm = async () => {
    const home = center.current
    const userId = session?.user.id
    if (busy.current || !home || !userId) return
    busy.current = true
    setSaving(true)
    setFailed(false)
    try {
      if (!status.hasProfile) {
        await profileRepo.create({ nickname: draft.nickname!, starterId: draft.starterId! })
        status.markProfileCreated()
      }
      saveHome(userId, home) // 自宅はこの端末の中だけに保存する
      clearDraft()
      status.markHomeSaved()
      navigate('/', { replace: true })
    } catch {
      setFailed(true)
      setSaving(false)
      busy.current = false
    }
  }

  return (
    <main className="setup-page setup-home">
      {!status.hasProfile && (
        <button type="button" className="setup-back" onClick={() => navigate('/setup/character')}>戻る</button>
      )}
      <h1>自宅の場所を決めよう</h1>
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
      {failed && <p className="setup-error" role="alert">保存できませんでした。もう一度お試しください</p>}
      <div className="setup-actions">
        <button type="button" onClick={() => setRecenter((n) => n + 1)} disabled={!locate.start}>現在地へ</button>
        <button type="button" onClick={() => void confirm()} disabled={!locate.start || saving}>
          {saving ? '保存しています…' : 'ここを自宅にする'}
        </button>
      </div>
    </main>
  )
}
