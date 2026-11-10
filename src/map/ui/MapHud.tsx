// 地図の上に重ねる部品: 左上のキャラ札（Lv）、上の真ん中の気配、下の真ん中のメニュー（扇で5つ）。
// 2026-11-10 オーナー決定の配置。メニューの丸のアイコンは仮（絵はミシェーラに依頼予定）。
import { useState } from 'react'
import { fanPositions } from '../domain/menuFan.ts'
import { Icon } from '../../ui/Icon.tsx'
import type { IconName } from '../../ui/Icon.tsx'

const CHARACTERS = import.meta.glob<string>('../../assets/characters/starter-*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const characterUrl = (starterId: number) =>
  CHARACTERS[starterId === 102 ? '../../assets/characters/starter-girl.webp' : '../../assets/characters/starter-boy.webp']

const MENU_ART = import.meta.glob<string>('../../assets/ui/menu-ramen.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const ramenUrl = MENU_ART['../../assets/ui/menu-ramen.webp']

const FAN_RADIUS = 160
const DISC = 54 // 扇の丸の大きさ（CSS の .hud-fan__disc と同じ）
const LABEL_BLOCK = 19 // 丸の下の文字の高さ＋すきま（CSS の .hud-fan small と同じ）
const BOX_W = 76 // 文字が入る幅（CSS の .hud-fan と同じ）

type Props = {
  nickname: string | null
  starterId: 101 | 102
  level: number
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
  const items: { icon: IconName; name: string; run: () => void }[] = [
    { icon: 'zukan', name: '図鑑', run: () => p.onZukan() },
    { icon: 'record', name: '記録', run: () => p.onRecord() },
    { icon: 'gacha', name: 'ガチャ', run: () => p.onSoon('ガチャ') },
    { icon: 'person', name: 'マイページ', run: () => p.onMyPage() },
    { icon: 'settings', name: '設定', run: () => p.onSettings() },
  ]
  const spots = fanPositions(items.length, 0, 0, FAN_RADIUS)
  return (
    <>
      <div className="hud-player" role="img" aria-label={`${p.nickname ?? 'あなた'} Lv ${p.level}`}>
        <img src={characterUrl(p.starterId)} alt="" />
        <span className="hud-player__lv">{`Lv ${p.level}`}</span>
      </div>

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
        ？
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
              <span className="hud-fan__disc">
                <Icon name={it.icon} size={28} />
              </span>
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
          {menuOpen ? <Icon name="close" size={28} /> : <img src={ramenUrl} alt="" className="hud-toggle__art" />}
        </button>
      </div>

    </>
  )
}
