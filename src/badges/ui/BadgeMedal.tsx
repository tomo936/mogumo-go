// 実績のメダル（SVG）。ギザギザのふち・金属の光・放射の模様・白ふちの絵・名前のリボン・★の数。
// 色は ★ の数で決まる（★1 クリーム … ★5 虹）。取れていないものは灰色、ひみつは「？？？」。
// 見本: art/prototypes/badge-medal.html（2026-11-10 オーナー確認）。正式な絵はミシェーラに依頼予定。
import { useId } from 'react'
import { IconGlyph } from '../../ui/Icon.tsx'
import { tierOf, type BadgeState, type Tier } from '../domain/types.ts'

const FOOD = import.meta.glob<string>('../../assets/badges/food/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const foodUrl = (kind: string) => FOOD[`../../assets/badges/food/${kind}.webp`]

type Look = { rim: string[]; face: [string, string] | null; ray: string; rib: [string, string] }
const LOOK: Record<Tier, Look> = {
  cream: { rim: ['#fffaf0', '#efe2c8', '#c9b48e', '#fbf3e2', '#d8c6a3'], face: ['#fffdf7', '#f6ecd8'], ray: '#ffffff88', rib: ['#b89668', '#8f7048'] },
  bronze: { rim: ['#f6c9a0', '#c47a45', '#8a4a22', '#e9a978', '#a55e2f'], face: ['#ffe6cf', '#e7a777'], ray: '#ffffff33', rib: ['#c0703a', '#93501f'] },
  silver: { rim: ['#ffffff', '#c3cad6', '#7d8798', '#eef1f6', '#9aa3b4'], face: ['#ffffff', '#cfd6e2'], ray: '#ffffff66', rib: ['#6f88b8', '#4d6596'] },
  gold: { rim: ['#fff6c2', '#f2c230', '#b07d0a', '#ffe27a', '#c99212'], face: ['#fff8d6', '#f6cf4f'], ray: '#ffffff55', rib: ['#e0503a', '#b0331f'] },
  rainbow: { rim: ['#fff6c2', '#f2c230', '#b07d0a', '#ffe27a', '#c99212'], face: null, ray: '#ffffff77', rib: ['#9a6ae0', '#6c3fc0'] },
}
const RAINBOW = ['#ffc4d6', '#fff0a6', '#c6f5c0', '#b9e4ff', '#e3c9ff']

const CX = 80
const CY = 74
const R = 60

// ギザギザのふち
function scallop(r: number, amp: number, bumps: number): string {
  const n = bumps * 4
  const pts: string[] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2
    const rr = r + amp * Math.cos(t * bumps)
    pts.push(`${(CX + rr * Math.sin(t)).toFixed(2)} ${(CY - rr * Math.cos(t)).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
}
// 中の放射の模様
function rays(r: number, count: number): string {
  let d = ''
  for (let i = 0; i < count; i++) {
    const a1 = (i / count) * Math.PI * 2
    const a2 = ((i + 0.5) / count) * Math.PI * 2
    d += `M${CX} ${CY}L${CX + r * Math.sin(a1)} ${CY - r * Math.cos(a1)}L${CX + r * Math.sin(a2)} ${CY - r * Math.cos(a2)}Z`
  }
  return d
}
const EDGE = scallop(R, 2.2, 22)
const RAYS = rays(R, 20)
const star = (x: number) => `M${x} 131l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z`

export function BadgeMedal({ state, size = 72 }: { state: BadgeState; size?: number }) {
  const uid = useId().replace(/:/g, '')
  const { def } = state
  const earned = state.earnedAt !== null
  const hidden = def.secret && !earned
  const tier = tierOf(def.stars)
  const look = LOOK[tier]
  const label = hidden ? '？？？' : def.name
  const id = (s: string) => `${uid}${s}`
  const rim = look.rim.map((c, i) => <stop key={i} offset={i / (look.rim.length - 1)} stopColor={c} />)
  const stars = Array.from({ length: def.stars }, (_, i) => CX + (i - (def.stars - 1) / 2) * 15)
  return (
    <svg width={size} height={(size * 170) / 160} viewBox="0 0 160 170" role="img" aria-label={`${label}${earned ? '' : '（まだ）'}`}>
      <defs>
        <linearGradient id={id('r')} x1="0" y1="0" x2="1" y2="1">{rim}</linearGradient>
        <linearGradient id={id('r2')} x1="1" y1="1" x2="0" y2="0">{rim}</linearGradient>
        {look.face ? (
          <radialGradient id={id('f')} cx=".4" cy=".35" r=".7">
            <stop offset="0" stopColor={look.face[0]} />
            <stop offset="1" stopColor={look.face[1]} />
          </radialGradient>
        ) : (
          <linearGradient id={id('f')} x1="0" y1="0" x2="1" y2="1">
            {RAINBOW.map((c, i) => <stop key={c} offset={i / (RAINBOW.length - 1)} stopColor={c} />)}
          </linearGradient>
        )}
        <linearGradient id={id('rb')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={look.rib[0]} />
          <stop offset="1" stopColor={look.rib[1]} />
        </linearGradient>
        <filter id={id('s')} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity=".3" />
        </filter>
        <filter id={id('w')}>
          <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d" />
          <feFlood floodColor="#fff" />
          <feComposite in2="d" operator="in" result="o" />
          <feMerge><feMergeNode in="o" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={id('g')}>
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer><feFuncA type="linear" slope=".45" /></feComponentTransfer>
        </filter>
        <clipPath id={id('c')}><circle cx={CX} cy={CY} r={R - 14} /></clipPath>
      </defs>
      <g filter={earned ? undefined : `url(#${id('g')})`}>
        <g filter={`url(#${id('s')})`}><path d={EDGE} fill={`url(#${id('r')})`} /></g>
        <circle cx={CX} cy={CY} r={R - 7} fill={`url(#${id('r2')})`} />
        <circle cx={CX} cy={CY} r={R - 11} fill={`url(#${id('r')})`} />
        <circle cx={CX} cy={CY} r={R - 14} fill={`url(#${id('f')})`} />
        <path d={RAYS} fill={look.ray} clipPath={`url(#${id('c')})`} />
        <circle cx={CX} cy={CY} r={R - 14} fill="none" stroke="#0002" strokeWidth="1.5" />
        {hidden ? (
          <text x={CX} y={CY + 14} textAnchor="middle" fontSize="40" fontWeight="900" fill="#8a6a48">？</text>
        ) : 'kind' in def.art ? (
          <image href={foodUrl(def.art.kind)} x={CX - 30} y={CY - 36} width="60" height="60" filter={`url(#${id('w')})`} />
        ) : (
          <g transform={`translate(${CX - 22} ${CY - 26}) scale(1.85)`}>
            <IconGlyph name={def.art.icon} color="#6b4a2b" />
          </g>
        )}
        <path d={`M${CX - 44} ${CY - 26} A50 50 0 0 1 ${CX + 30} ${CY - 46} A58 58 0 0 0 ${CX - 44} ${CY - 26}Z`} fill="#fff" opacity=".55" clipPath={`url(#${id('c')})`} />
        <g filter={`url(#${id('s')})`}>
          <path d="M6 112h22l-4 9 4 9H6z" fill={look.rib[1]} />
          <path d="M154 112h-22l4 9-4 9h22z" fill={look.rib[1]} />
          <rect x="20" y="106" width="120" height="22" rx="3" fill={`url(#${id('rb')})`} />
          <rect x="20" y="106" width="120" height="5" rx="2" fill="#fff" opacity=".25" />
          <text
            x={CX}
            y="122"
            textAnchor="middle"
            fontSize="12"
            fontWeight="900"
            fill="#fff"
            {...(label.length > 9 ? { textLength: 112, lengthAdjust: 'spacingAndGlyphs' } : {})}
          >
            {label}
          </text>
        </g>
        {stars.map((x) => (
          <path key={x} d={star(x)} fill="#ffcc33" stroke="#7a4a1c" strokeWidth="1.1" strokeLinejoin="round" />
        ))}
        {tier === 'rainbow' && earned && (
          <>
            <path d="M28 30l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff" />
            <path d="M134 22l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" fill="#fff59a" />
            <path d="M140 70l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z" fill="#fff" />
          </>
        )}
      </g>
    </svg>
  )
}
