// まわしたあとの画面（A15）。見本 art/reference/gacha/pull-ref.png（火にかかった鍋）。設計 docs/superpowers/specs/2026-11-17-gacha-design.md の 4
// 鍋が揺れる → ふたが浮いて光（★3 白・★4 金・★5 虹）→ 1 体ずつ → 10 連は最後に一覧。どこを押しても演出を飛ばす。
// 背景・鍋とかまど・ふた・湯気・光の柱はミシェーラの絵（pull.css・src/assets/gacha/ui/）
import { useEffect, useState } from 'react'
import './pull.css'
import { characterById } from '../domain/characters.ts'
import { bestRarity, friendshipHearts } from '../domain/gacha.ts'
import type { Draw } from '../domain/gacha.ts'
import { standArtUrl } from '../infra/gachaApi.ts'
import { NewBadge, RibbonName, Stars } from './GachaScreen.tsx'
import potUrl from '../../assets/gacha/ui/08-pot.webp'
import lidUrl from '../../assets/gacha/ui/09-lid.webp'
import steamUrl from '../../assets/gacha/ui/10-steam.webp'
import pillarUrl from '../../assets/gacha/ui/03-light-pillar.webp'

type Props = { draws: Draw[]; onDone: () => void }
type Phase = { k: 'pot' } | { k: 'open' } | { k: 'one'; i: number } | { k: 'list' }

const POT_MS = 1500
const OPEN_MS = 1100

export function PullScreen({ draws, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>({ k: 'pot' })
  const glow = bestRarity(draws)
  useEffect(() => {
    if (phase.k === 'pot') {
      const t = setTimeout(() => setPhase({ k: 'open' }), POT_MS)
      return () => clearTimeout(t)
    }
    if (phase.k === 'open') {
      const t = setTimeout(() => setPhase({ k: 'one', i: 0 }), OPEN_MS)
      return () => clearTimeout(t)
    }
  }, [phase.k])

  const next = () => {
    if (phase.k === 'pot' || phase.k === 'open') return setPhase({ k: 'one', i: 0 })
    if (phase.k === 'one' && phase.i + 1 < draws.length) return setPhase({ k: 'one', i: phase.i + 1 })
    if (phase.k === 'one' && draws.length > 1) return setPhase({ k: 'list' })
  }
  const last = phase.k === 'list' || (phase.k === 'one' && draws.length === 1)

  return (
    <div className={`pl pl--r${glow}`} role="dialog" aria-label="ガチャの結果" onClick={next}>
      {draws.length > 1 && phase.k !== 'list' && (
        <button
          type="button"
          className="pl__skip"
          onClick={(e) => {
            e.stopPropagation()
            setPhase({ k: 'list' })
          }}
        >
          スキップ
        </button>
      )}

      {(phase.k === 'pot' || phase.k === 'open') && (
        <div className={phase.k === 'open' ? 'pl__pot is-open' : 'pl__pot'} aria-hidden="true">
          <img className="pl__beam" src={pillarUrl} alt="" />
          <img className="pl__steam pl__steam--1" src={steamUrl} alt="" />
          <img className="pl__steam pl__steam--2" src={steamUrl} alt="" />
          <img className="pl__steam pl__steam--3" src={steamUrl} alt="" />
          <img className="pl__body" src={potUrl} alt="" />
          <img className="pl__lid" src={lidUrl} alt="" />
        </div>
      )}

      {phase.k === 'one' && <One d={draws[phase.i]} count={draws.length > 1 ? `${phase.i + 1} / ${draws.length}` : null} />}

      {phase.k === 'list' && (
        <ul className="pl__list">
          {draws.map((d) => {
            const c = characterById(d.characterId)
            return (
              <li key={d.pos} className={`pl__cell pl__cell--r${d.rarity}`}>
                <img src={standArtUrl(d.characterId)} alt="" />
                <span>{c?.name ?? '？'}</span>
                {d.isNew && <i className="pl__cell-new">NEW</i>}
              </li>
            )
          })}
        </ul>
      )}

      {last && (
        <button
          type="button"
          className="pl__done"
          onClick={(e) => {
            e.stopPropagation()
            onDone()
          }}
        >
          とじる
        </button>
      )}
      {phase.k === 'one' && !last && <p className="pl__hint">タップで次へ</p>}
    </div>
  )
}

function One({ d, count }: { d: Draw; count: string | null }) {
  const c = characterById(d.characterId)
  return (
    <div className={`pl__one pl__one--r${d.rarity}`} key={d.pos}>
      {count && <span className="pl__count">{count}</span>}
      <Stars n={d.rarity} />
      <RibbonName name={c?.name ?? '？'} />
      <div className="gc__stage pl__stage">
        <span className="gc__glow" aria-hidden="true" />
        <img src={standArtUrl(d.characterId)} alt="" />
        {d.isNew ? (
          <NewBadge />
        ) : (
          <span className="pl__friend">{`なかよし度 ♥+1（${'♥'.repeat(friendshipHearts(d.friendship))}）`}</span>
        )}
      </div>
    </div>
  )
}
