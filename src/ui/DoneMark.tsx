// 「済み」の印。地図のピン（src/shops/infra/checkBadge.ts の canvas の絵）と同じ形:
// 白いふちの緑の丸に、線で描いた ✓。文字の ✓ は端末で形が変わるので使わない
export function DoneMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="済み">
      <circle cx="12" cy="12" r="12" fill="#fff" />
      <circle cx="12" cy="12" r="10.1" fill="#3ecf8e" />
      <path d="M7.4 12.2l3.6 3.6 6-6.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
