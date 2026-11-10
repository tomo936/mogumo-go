// 町の進み具合の絵（SVG）。雲 = まだ、おひさま = クリア、かんむり = コンプリート。
// 見本を 2026-11-10 にオーナーが確認（ゲージの案）。正式な絵が要るときはミシェーラに頼む。
export type TownIconKind = 'cloud' | 'sun' | 'crown'

const RAYS = 'M20 2v5M20 33v5M2 20h5M33 20h5M7.3 7.3l3.5 3.5M29.2 29.2l3.5 3.5M7.3 32.7l3.5-3.5M29.2 10.8l3.5-3.5'

export function TownIcon({ kind, size }: { kind: TownIconKind; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {kind === 'cloud' && <path d="M10 28a7 7 0 0 1 1-13.9A9 9 0 0 1 28.5 12 7.5 7.5 0 0 1 30 28z" fill="#fff" />}
      {kind === 'sun' && (
        <>
          <path d={RAYS} stroke="#ffb703" strokeWidth="3" strokeLinecap="round" />
          <circle cx="20" cy="20" r="10.5" fill="#ffd23f" />
          <circle cx="16.5" cy="18.5" r="1.4" fill="#7a4a26" />
          <circle cx="23.5" cy="18.5" r="1.4" fill="#7a4a26" />
          <path d="M16.5 22.5q3.5 3 7 0" stroke="#7a4a26" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <circle cx="14" cy="22" r="1.6" fill="#ff9aa8" opacity="0.8" />
          <circle cx="26" cy="22" r="1.6" fill="#ff9aa8" opacity="0.8" />
        </>
      )}
      {kind === 'crown' && (
        <>
          <path d="M6 28l-2-15 8 6 8-11 8 11 8-6-2 15z" fill="#ffd23f" stroke="#f2a900" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="20" cy="22" r="2.2" fill="#ff8a75" />
        </>
      )}
    </svg>
  )
}
