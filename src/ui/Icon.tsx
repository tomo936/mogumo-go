// アプリ共通の線のアイコン（2026-11-10）。絵文字の仮をやめて、色・太さをそろえる。24×24、currentColor で塗る。
import type { ReactNode } from 'react'

export type IconName =
  | 'pin' | 'pinOff' | 'close' | 'back' | 'home'
  // 実績のメダルの中の絵（src/badges/domain/types.ts の BadgeIcon と同じ名前）
  | 'walk' | 'store' | 'cloud' | 'flag' | 'compass' | 'calendar' | 'bowls' | 'hint'
  | 'sun' | 'moon' | 'clock' | 'heart' | 'gift' | 'leaf' | 'star' | 'pencil' | 'mail' | 'lock' | 'sound' | 'bell' | 'info'

const PATHS: Record<IconName, ReactNode> = {
  pin: (
    <>
      <path d="M12 21.5s-6.5-5.5-6.5-11a6.5 6.5 0 1 1 13 0c0 5.5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </>
  ),
  pinOff: (
    <>
      <path d="M12 21.5s-6.5-5.5-6.5-11a6.5 6.5 0 1 1 13 0c0 5.5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10.5" r="2.3" />
      <path d="M3.5 3.5l17 17" />
    </>
  ),
  close: <path d="M5 5l14 14M19 5L5 19" />,
  back: <path d="M15 5l-7 7 7 7" />,
  home: (
    <>
      <path d="M3 11.5L12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  walk: (
    <>
      <path d="M7.5 3.5c1.6 0 2.5 1.6 2.5 3.6S9 11 7.5 11 5 9.1 5 7.1s.9-3.6 2.5-3.6z" />
      <path d="M16.5 10c1.6 0 2.5 1.6 2.5 3.6s-1 3.9-2.5 3.9-2.5-1.9-2.5-3.9.9-3.6 2.5-3.6z" />
      <path d="M6.3 13.5h2.4M15.3 20h2.4" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.5V20h16V9.5" />
      <path d="M3 9.5l2-5.5h14l2 5.5c0 1.5-1.3 2.5-2.7 2.5S15.6 11 15.6 9.5c0 1.5-1.3 2.5-2.8 2.5h-1.6c-1.5 0-2.8-1-2.8-2.5C8.4 11 7.1 12 5.7 12S3 11 3 9.5z" />
      <path d="M10 20v-4.5h4V20" />
    </>
  ),
  cloud: <path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.2 18.5z" />,
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4.5c4-2 6 2 10 0s4 0 4 0v9s-1.5-2-4 0-6-2-10 0" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8.5 14.5l2 2 4-4" />
    </>
  ),
  bowls: (
    <>
      <path d="M2.5 11h11a5.5 5.5 0 0 1-11 0z" />
      <path d="M12.5 15h9a4.5 4.5 0 0 1-9 0z" />
      <path d="M6 7.5c0-1.2 1-1.2 1-2.5M9.5 7.5c0-1.2 1-1.2 1-2.5" />
    </>
  ),
  hint: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8" />
      <path d="M12 17h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />,
  gift: (
    <>
      <rect x="3.5" y="9" width="17" height="4" rx="1" />
      <path d="M5 13v7.5h14V13M12 9v11.5" />
      <path d="M12 9c-1-3-5-4.5-5.5-2S10 9 12 9c2 0 6-.5 5.5-2S13 6 12 9z" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" />
      <path d="M5 19l8-8" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" />,
  pencil: (
    <>
      <path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5z" />
      <path d="M14 6.5l3 3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
}

// SVG の中に線のアイコンを置くための部品（座標は 24×24。呼び出し側で transform する）
export function IconGlyph({ name, color }: { name: IconName; color: string }) {
  return (
    <g fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </g>
  )
}

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
