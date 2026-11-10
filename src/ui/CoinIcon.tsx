// コインの絵（地図の上・気配・週ミッション・チェックインの帯で共通）。
// 今は仮の絵（SVG）。ミシェーラの素材が来たら、ここだけを差し替える。
export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="coin-icon">
      <circle cx="12" cy="12" r="10" fill="#dba400" stroke="#a87a00" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6.2" fill="none" stroke="#fff3c4" strokeWidth="1.6" />
    </svg>
  )
}
