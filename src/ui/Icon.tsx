// アプリ共通の線のアイコン（2026-11-10）。絵文字の仮をやめて、色・太さをそろえる。24×24、currentColor で塗る。
import type { ReactNode } from 'react'

export type IconName = 'zukan' | 'record' | 'gacha' | 'person' | 'settings' | 'pin' | 'pinOff' | 'ramen' | 'close' | 'back' | 'home'

const PATHS: Record<IconName, ReactNode> = {
  zukan: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5" />
      <path d="M8 7h7M8 11h5" />
    </>
  ),
  record: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  gacha: (
    <>
      <circle cx="12" cy="9" r="7" />
      <circle cx="9.3" cy="8.4" r="1.3" />
      <circle cx="14.4" cy="10.4" r="1.3" />
      <path d="M4.5 16.8h15V21a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
      <path d="M10.2 19.4h3.6" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </>
  ),
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
  ramen: (
    <>
      <path d="M3 12h18a9 9 0 0 1-18 0z" />
      <path d="M8 12c.5-1.2 1.2-1.8 2-1.8M12 12c.5-1.2 1.2-1.8 2-1.8" />
      <path d="M15 2.5l-3.6 7M18.5 3.5l-4.3 6.4" />
      <path d="M9 21h6" />
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
}

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
