// コインの絵（地図の上・気配・週ミッション・チェックインの帯で共通）。ミシェーラのグルメコイン（2026-11-12）。
import coinUrl from '../assets/ui/gourmet-coin.webp'

export function CoinIcon({ size = 18 }: { size?: number }) {
  return <img src={coinUrl} width={size} height={size} alt="" aria-hidden="true" className="coin-icon" />
}
