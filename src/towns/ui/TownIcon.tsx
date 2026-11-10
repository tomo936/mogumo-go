// 町の進み具合の印（SVG）。旗 = クリア、かんむり = コンプリート、うすい旗 = まだ。
// 平らな色で、実績のメダル（BadgeMedal）と同じギザギザのふちをコンプリートにだけ付ける。
export type TownIconKind = 'none' | 'clear' | 'complete'

const LOOK: Record<TownIconKind, { face: string; ring: string; glyph: string }> = {
  none: { face: '#efe6d2', ring: '#e3d6ba', glyph: '#b9a684' },
  clear: { face: '#c2652a', ring: '#eab894', glyph: '#fffdf7' },
  complete: { face: '#dba400', ring: '#f4d877', glyph: '#fffdf7' },
}

// ギザギザのふち（中心 20,20）
function scallop(r: number, amp: number, bumps: number): string {
  const n = bumps * 6
  const pts: string[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const rr = r + amp * Math.cos(t * bumps)
    pts.push(`${(20 + rr * Math.sin(t)).toFixed(2)} ${(20 - rr * Math.cos(t)).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
}
const EDGE = scallop(18, 1.2, 14)

export function TownIcon({ kind, size }: { kind: TownIconKind; size: number }) {
  const c = LOOK[kind]
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {kind === 'complete' ? <path d={EDGE} fill={c.ring} /> : <circle cx="20" cy="20" r="19" fill={c.ring} />}
      <circle cx="20" cy="20" r="15.5" fill={c.face} />
      {kind === 'complete' ? (
        <path d="M11.5 25.5l-1.7-10 5.9 4.2L20 12l4.3 7.7 5.9-4.2-1.7 10z" fill={c.glyph} />
      ) : (
        <>
          <path d="M15 11.5v17.5" stroke={c.glyph} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16.6 12.4h10.6l-2.9 3.9 2.9 3.9H16.6z" fill={c.glyph} />
        </>
      )}
    </svg>
  )
}
