// 位置情報が取れなかった理由（ブラウザの API に依存しない言葉で表す）
export type GeoFailure = 'denied' | 'unavailable' | 'timeout'

export type LocationStatus = 'searching' | 'tracking' | 'waiting' | 'denied' | 'notFound'
export type LocationEvent =
  | { type: 'fix' }
  | { type: 'failure'; failure: GeoFailure }
  | { type: 'firstFixTimeout' }
  | { type: 'retry' }

// 状態が変わらないときは同じ値を返す（React の再描画を起こさない）
export function nextStatus(status: LocationStatus, event: LocationEvent): LocationStatus {
  if (status === 'denied') return status
  switch (event.type) {
    case 'fix':
      return 'tracking'
    case 'failure':
      if (event.failure === 'denied') return 'denied'
      return status === 'tracking' || status === 'waiting' ? 'waiting' : status
    case 'firstFixTimeout':
      return status === 'searching' ? 'notFound' : status
    case 'retry':
      return status === 'notFound' ? 'searching' : status
  }
}
