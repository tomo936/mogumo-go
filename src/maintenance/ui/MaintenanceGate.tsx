// メンテナンス（A8）: 起動時・アプリに戻ってきたとき・開いている間 1 分ごとに確かめ、メンテ中ならメンテの画面だけを出す。
// メンテ中はアプリの画面を外す（地図などが裏で書き込みを続けないように）。?debug で開いたときは通す（オーナーの確認用）。
// 読めないときは止めない。
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import './maintenance.css'
import { CHECK_EVERY_MS, endsLabel } from '../domain/maintenance.ts'
import type { MaintenanceStatus } from '../domain/maintenance.ts'
import { loadMaintenance } from '../infra/maintenanceApi.ts'
import { debugOn } from '../../map/ui/debugOverlay.ts'
import pokoStill from '../../assets/guide/poko.webp'

type Props = { children: ReactNode; load?: () => Promise<MaintenanceStatus | null> }

export function MaintenanceGate({ children, load = loadMaintenance }: Props) {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const check = useCallback(async () => {
    setChecking(true)
    const s = await load()
    setChecking(false)
    if (s) setStatus(s) // 読めなかったときは前の様子のまま
  }, [load])

  useEffect(() => {
    void check()
    const id = setInterval(() => void check(), CHECK_EVERY_MS)
    const onVisible = () => !document.hidden && void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  if (!status?.on || debugOn(window.location.search)) return <>{children}</>
  const ends = endsLabel(status.endsAt, new Date())
  return (
    <main className="maint" aria-label="メンテナンス中">
      <img className="maint__poko" src={pokoStill} alt="" />
      <div className="maint__box">
        <h1>ただいまメンテナンス中ポコ！</h1>
        {status.message && <p className="maint__msg">{status.message}</p>}
        {ends && <p className="maint__ends">{ends}</p>}
        <p className="maint__sub">終わるまで、もう少しだけ待っててポコ〜</p>
        <button type="button" className="maint__retry" disabled={checking} onClick={() => void check()}>
          {checking ? '確かめています…' : 'もう一度確かめる'}
        </button>
      </div>
    </main>
  )
}
