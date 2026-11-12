// 地図の上に重ねる部品: 左上のキャラ札（Lv）、上の真ん中の気配、下の真ん中のメニュー（扇で5つ）。
// 2026-11-10 オーナー決定の配置。メニュー・気配の絵はミシェーラの完成形（2026-11-12、丸と枠まで絵に入っている）。
import { useState } from 'react'
import { fanPositions } from '../domain/menuFan.ts'
import { Icon } from '../../ui/Icon.tsx'
import { CoinIcon } from '../../ui/CoinIcon.tsx'

const CHARACTERS = import.meta.glob<string>('../../assets/characters/starter-*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const characterUrl = (starterId: number) =>
  CHARACTERS[starterId === 102 ? '../../assets/characters/starter-girl.webp' : '../../assets/characters/starter-boy.webp']

const UI_ART = import.meta.glob<string>('../../assets/ui/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const art = (name: string) => UI_ART[`../../assets/ui/${name}.webp`]

const FAN_RADIUS = 160
const DISC = 54 // 扇の丸の大きさ（CSS の .hud-fan__disc と同じ）
const LABEL_BLOCK = 19 // 丸の下の文字の高さ＋すきま（CSS の .hud-fan small と同じ）
const BOX_W = 76 // 文字が入る幅（CSS の .hud-fan と同じ）

type Props = {
  nickname: string | null
  starterId: 101 | 102
  level: number
  expInto: number // 今の Lv に入ってから行ったお店の数（経験値）
  expSpan: number // 次の Lv まで必要な軒数
  coins: number | null
  hintsRemaining: number | null
  hintOpen: boolean
  onHintTap: () => void
  onZukan: () => void
  onRecord: () => void
  onMyPage: () => void
  onSettings: () => void
  onSoon: (name: string) => void
  pinsHidden: boolean
  onTogglePins: () => void
}

export function MapHud(p: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const items: { art: string; name: string; run: () => void }[] = [
    { art: 'collection', name: '図鑑', run: () => p.onZukan() },
    { art: 'record', name: '記録', run: () => p.onRecord() },
    { art: 'gacha', name: 'ガチャ', run: () => p.onSoon('ガチャ') },
    { art: 'mypage', name: 'マイページ', run: () => p.onMyPage() },
    { art: 'settings', name: '設定', run: () => p.onSettings() },
  ]
  const spots = fanPositions(items.length, 0, 0, FAN_RADIUS)
  return (
    <>
      <div
        className="hud-player"
        role="img"
        aria-label={`${p.nickname ?? 'あなた'} Lv ${p.level} 次のレベルまであと${Math.max(0, p.expSpan - p.expInto)}軒`}
        style={{ '--exp': `${Math.min(100, Math.max(0, (p.expInto / Math.max(1, p.expSpan)) * 100))}%` } as React.CSSProperties}
      >
        <img src={characterUrl(p.starterId)} alt="" />
        <span className="hud-player__lv">{`Lv ${p.level}`}</span>
      </div>

      {p.coins !== null && (
        <div className="hud-coins" role="img" aria-label={`コイン ${p.coins}`}>
          <CoinIcon size={18} />
          <b>{p.coins}</b>
        </div>
      )}

      <button
        type="button"
        className="hud-pins"
        aria-label={p.pinsHidden ? 'ピンを出す' : 'ピンを隠す'}
        aria-pressed={p.pinsHidden}
        onClick={p.onTogglePins}
      >
        <Icon name={p.pinsHidden ? 'pinOff' : 'pin'} size={22} />
        <small>ピン</small>
      </button>

      <button type="button" className="hud-hint" aria-label="気配" aria-expanded={p.hintOpen} onClick={p.onHintTap}>
        <img src={art('kehai-cloud')} alt="" />
      </button>

      <div className="hud-menu">
        {menuOpen &&
          items.map((it, i) => (
            <button
              key={it.name}
              type="button"
              className="hud-fan"
              aria-label={it.name}
              style={{ left: spots[i].x - BOX_W / 2, bottom: -spots[i].y - DISC / 2 - LABEL_BLOCK }}
              onClick={() => {
                setMenuOpen(false)
                it.run()
              }}
            >
              <img className="hud-fan__disc" src={art(`btn-${it.art}`)} alt="" />
              <small>{it.name}</small>
            </button>
          ))}
        <button
          type="button"
          className={`hud-toggle${menuOpen ? ' hud-toggle--close' : ''}`}
          aria-label={menuOpen ? '閉じる' : 'メニュー'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((x) => !x)}
        >
          <img src={art(menuOpen ? 'icon-close' : 'btn-cloche')} alt="" className="hud-toggle__art" />
        </button>
      </div>

    </>
  )
}
