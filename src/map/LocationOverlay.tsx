import type { LocationStatus } from './locationStatus.ts'

type Props = { status: LocationStatus; onRetry: () => void; onReload: () => void }

export function LocationOverlay({ status, onRetry, onReload }: Props) {
  switch (status) {
    case 'tracking':
      return null
    case 'searching':
      return <p className="location-banner">現在地を探しています…</p>
    case 'waiting':
      return <p className="location-banner">位置情報を待っています…</p>
    case 'denied':
      return (
        <div className="location-screen">
          <h1>位置情報がオフになっています</h1>
          <p>
            iPhone の『設定』→『プライバシーとセキュリティ』→『位置情報サービス』→『Safari の Web
            サイト』で『使用中のみ』にしてから、このページを再読み込みしてください
          </p>
          <button type="button" onClick={onReload}>再読み込み</button>
        </div>
      )
    case 'notFound':
      return (
        <div className="location-screen">
          <h1>現在地が見つかりません</h1>
          <button type="button" onClick={onRetry}>もう一度試す</button>
        </div>
      )
  }
}
