// 地図の上に重ねる部品: 左上のキャラ札（Lv）、上の真ん中の気配、下の真ん中のメニュー（扇で5つ）。
// 2026-11-10 オーナー決定の配置。メニューの丸のアイコンは仮（絵はミシェーラに依頼予定）。
import { useState } from 'react'
import type { ReactNode } from 'react'
import { fanPositions } from '../domain/menuFan.ts'

const CHARACTERS = import.meta.glob<string>('../../assets/characters/starter-*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const characterUrl = (starterId: number) =>
  CHARACTERS[starterId === 102 ? '../../assets/characters/starter-girl.webp' : '../../assets/characters/starter-boy.webp']

const FAN_RADIUS = 138
const BUTTON = 64

type Props = {
  nickname: string | null
  starterId: 101 | 102
  level: number
  hintsRemaining: number | null
  hintOpen: boolean
  onHintTap: () => void
  onZukan: () => void
  onSoon: (name: string) => void
  settings: ReactNode // 設定の中身（出典・ピンの表示・ログアウト）
  pinsHidden: boolean
  onTogglePins: () => void
}

export function MapHud(p: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const items = [
    { icon: '📖', name: '図鑑', run: () => p.onZukan() },
    { icon: '📝', name: '記録', run: () => p.onSoon('記録') },
    { icon: '🎰', name: 'ガチャ', run: () => p.onSoon('ガチャ') },
    { icon: '👤', name: 'マイページ', run: () => p.onSoon('マイページ') },
    { icon: '⚙️', name: '設定', run: () => setSettingsOpen(true) },
  ]
  const spots = fanPositions(items.length, 0, 0, FAN_RADIUS)
  return (
    <>
      <div className="hud-player" aria-label="プレイヤー">
        <img src={characterUrl(p.starterId)} alt="" />
        <div>
          <b>{p.nickname ?? 'あなた'}</b>
          <span>{`Lv ${p.level}`}</span>
        </div>
      </div>

      <button
        type="button"
        className="hud-pins"
        aria-label={p.pinsHidden ? 'ピンを出す' : 'ピンを隠す'}
        aria-pressed={p.pinsHidden}
        onClick={p.onTogglePins}
      >
        {p.pinsHidden ? '🚫' : '📍'}
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
              style={{ left: spots[i].x - BUTTON / 2, bottom: -spots[i].y - BUTTON / 2 }}
              onClick={() => {
                setMenuOpen(false)
                it.run()
              }}
            >
              <span>{it.icon}</span>
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
          {menuOpen ? '×' : '🍜'}
        </button>
      </div>

      {settingsOpen && (
        <section className="hud-screen" aria-label="設定">
          <header className="hud-screen__bar">
            <button type="button" className="hud-screen__back" aria-label="戻る" onClick={() => setSettingsOpen(false)}>
              ←
            </button>
            <h2>設定</h2>
          </header>
          <div className="hud-screen__body">{p.settings}</div>
        </section>
      )}
    </>
  )
}
