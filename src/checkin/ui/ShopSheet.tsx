// お店をタップしたときに下から出るシート。チェックインのボタンは 50m 以内だけ押せる。
import './checkin.css'
import type { ShopKind } from '../../shops/domain/shop.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { CHECKIN_M } from '../../shops/config.ts'
import { formatOpen } from '../domain/openHours.ts'

export type CheckinError = 'too_far' | 'network' | 'not_found' | 'no_profile' | 'already_today'

const ERROR_TEXT: Record<CheckinError, string> = {
  too_far: 'お店から50mより遠いようです',
  network: '通信できませんでした。記録されていることもあるので、少し待ってからもう一度押してください',
  not_found: 'このお店は見つかりませんでした',
  no_profile: '初回設定を終えてからチェックインできます',
  already_today: 'このお店は今日もうチェックインしました。また明日来てね',
}

// シロのアイコンが届くまでの仮のバッジ色（パステル13色）
const BADGE_COLOR: Record<ShopKind, string> = {
  ramen: '#ffd6a5', sushi: '#ffadad', soba: '#d4c5a9', washoku: '#caffbf', izakaya: '#ffc6ff',
  chinese: '#ffb3a7', yakiniku: '#f4a6a6', western: '#fdffb6', curry: '#ffe08a', cafe: '#d7c0ae',
  cake: '#ffd1e8', bakery: '#f5deb3', mystery: '#bdb2ff',
}

type Props = {
  shop: Shop
  distanceM: number
  doneToday?: boolean // 今日もうチェックインしたお店
  busy: boolean
  error: CheckinError | null
  onCheckin: () => void
  onClose: () => void
}

export function ShopSheet({ shop, distanceM, doneToday = false, busy, error, onCheckin, onClose }: Props) {
  const inRange = distanceM <= CHECKIN_M
  const open = shop.details?.open
  return (
    <section className="shop-sheet" aria-label="お店の情報">
      <button type="button" className="shop-sheet__close" aria-label="閉じる" onClick={onClose}>
        ×
      </button>
      <div className="shop-sheet__head">
        <span className="shop-sheet__badge" style={{ background: BADGE_COLOR[shop.kind] }} aria-hidden="true" />
        <div>
          <h2 className="shop-sheet__name">{shop.name}</h2>
          {open && <p className="shop-sheet__open">{formatOpen(open)}</p>}
          <p className="shop-sheet__distance">{`ここから ${Math.ceil(distanceM)}m`}</p>
        </div>
      </div>
      {error && (
        <p className="shop-sheet__error" role="alert">
          {ERROR_TEXT[error]}
        </p>
      )}
      <button type="button" className="shop-sheet__go" disabled={doneToday || !inRange || busy} onClick={onCheckin}>
        {doneToday ? '今日はチェックイン済み' : busy ? 'チェックイン中…' : inRange ? 'チェックイン' : `あと ${Math.ceil(distanceM - CHECKIN_M)}m`}
      </button>
    </section>
  )
}
