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
import { Icon } from '../../ui/Icon.tsx'
import { HOME_CLEAR_RADIUS_M } from '../../fog/config.ts'
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
        try {
          await profileRepo.create({ nickname: draft.nickname!, starterId: draft.starterId! })
        } catch (e) {
          // 通信が切れても、サーバーには作れていることがある（再度押すと重複になる）。読み直して確かめる
          if (!(await profileRepo.exists(userId))) throw e
        }
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
    <main className="setup-page setup-home hs">
      <header className="hs__bar">
        {!status.hasProfile && (
          <button type="button" className="hs__back" aria-label="戻る" onClick={() => navigate('/setup/character')}>
            <Icon name="back" size={20} />
          </button>
        )}
        {!status.hasProfile && <span className="hs__step">3 / 3</span>}
      </header>
      <h1>自宅の場所を決めよう</h1>
      <p className="hs__lead">地図を動かして、家の印を自宅に合わせてね</p>
      <div className="setup-map hs__map">
        {locate.start && <HomePickerMap start={locate.start} recenter={recenter} onCenterChange={onCenterChange} />}
        <LocationOverlay
          status={locate.status}
          onRetry={() => {
            setLocate({ status: 'searching', start: null })
            setAttempt((n) => n + 1)
          }}
          onReload={() => window.location.reload()}
        />
        {locate.start && (
          <button type="button" className="hs__here" onClick={() => setRecenter((n) => n + 1)}>
            <Icon name="compass" size={18} />
            現在地へ
          </button>
        )}
      </div>
      <ul className="hs__notes">
        <li>
          <Icon name="lock" size={18} />
          <span>自宅の場所はこのスマホの中だけに保存します。サーバーには送りません</span>
        </li>
        <li>
          <Icon name="cloud" size={18} />
          <span>{`自宅のまわり ${HOME_CLEAR_RADIUS_M}m は、はじめから霧が晴れています。あとからマイページで変えられます`}</span>
        </li>
      </ul>
      {failed && <p className="setup-error" role="alert">保存できませんでした。もう一度お試しください</p>}
      <button type="button" className="hs__ok" onClick={() => void confirm()} disabled={!locate.start || saving}>
        {saving ? '保存しています…' : 'ここを自宅にする'}
      </button>
    </main>
  )
}
