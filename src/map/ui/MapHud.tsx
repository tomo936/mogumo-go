// 地図の上に重ねる部品: 左上のキャラ札（Lv）、上の真ん中の気配、下の真ん中のメニュー（扇で5つ）。
// 2026-11-10 オーナー決定の配置。メニュー・気配の絵はミシェーラの完成形（2026-11-12、丸と枠まで絵に入っている）。
import { useEffect, useRef, useState } from 'react'
import { fanPositions } from '../domain/menuFan.ts'
import { CoinIcon } from '../../ui/CoinIcon.tsx'

const CHARACTERS = import.meta.glob<string>('../../assets/characters/starter-*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const characterUrl = (starterId: number) =>
  CHARACTERS[starterId === 102 ? '../../assets/characters/starter-girl.webp' : '../../assets/characters/starter-boy.webp']

const UI_ART = import.meta.glob<string>('../../assets/ui/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const art = (name: string) => UI_ART[`../../assets/ui/${name}.webp`]

const FAN_RADIUS = 160
const DISC = 64 // 扇の丸の大きさ（CSS の .hud-fan__disc と同じ。2026-11-12 オーナー「もう少し大きく」で 54→64）
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
  subscribeBearing: (cb: (bearingDeg: number) => void) => () => void // 地図の回転を受け取る（方位磁針）
  onCompass: () => void // 方位磁針を押した: 北を上に戻す
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

      <Compass subscribe={p.subscribeBearing} onTap={p.onCompass} />

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

// 右上の方位磁針（2026-11-12 オーナー: ピンのボタンの代わり。ピンの出し入れは設定に残る）。
// 地図が回ると、針が北を指すように絵ごと回す。押すと北を上に戻す。回すたびに画面全体を描き直さないよう、絵の向きだけを直接変える
function Compass({ subscribe, onTap }: { subscribe: Props['subscribeBearing']; onTap: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null)
  useEffect(
    () =>
      subscribe((b) => {
        if (imgRef.current) imgRef.current.style.transform = `rotate(${-b}deg)`
      }),
    [subscribe],
  )
  return (
    <button type="button" className="hud-compass" aria-label="北を上にする" onClick={onTap}>
      <img ref={imgRef} src={art('compass')} alt="" />
    </button>
  )
}
