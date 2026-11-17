// ガチャの画面（A15）。見本 art/reference/gacha/gacha-screen-ref.png。設計 docs/superpowers/specs/2026-11-17-gacha-design.md
// 背景・看板・台・光の柱・帯・★・NEW! はミシェーラの絵（gacha.css・src/assets/gacha/ui/）
import { useEffect, useState } from 'react'
import './gacha.css'
import { CHARACTERS } from '../domain/characters.ts'
import type { Rarity } from '../domain/characters.ts'
import { DRAW_COST, RATES, untilCeiling } from '../domain/gacha.ts'
import type { DrawType } from '../domain/gacha.ts'
import { standArtUrl } from '../infra/gachaApi.ts'
import { Icon } from '../../ui/Icon.tsx'
import { CoinIcon } from '../../ui/CoinIcon.tsx'
import starUrl from '../../assets/gacha/ui/05-star.webp'

type Props = {
  coins: number | null
  owned: ReadonlyMap<number, number>
  pullsSinceFive: number
  busy: boolean
  error: string | null
  onDraw: (type: DrawType) => void
  onClose: () => void
}

const POOL = CHARACTERS.filter((c) => c.inPool).sort((a, b) => (b.rarity ?? 0) - (a.rarity ?? 0))
const SHOWCASE_MS = 3000

export function Stars({ n }: { n: number }) {
  return (
    <span className="gc-stars" aria-label={`★${n}`}>
      {Array.from({ length: n }, (_, i) => (
        <img key={i} src={starUrl} alt="" />
      ))}
    </span>
  )
}

// 帯の名前。帯の布は山なりの弧（真ん中が高い。絵を測ると、布の中心線は 幅の位置 u で 高さの 0.322 + 1.12×(u−0.5)²）。
// 1 文字ずつ、その弧に沿って下げて傾ける。読み上げは 1 つの文字列
const RIBBON_FONT = 18
const RIBBON_PAD = 48
export function RibbonName({ name }: { name: string }) {
  const chars = [...name]
  const w = Math.max(230, chars.length * RIBBON_FONT + RIBBON_PAD * 2)
  const h = 60
  return (
    <span className="gc__ribbon" style={{ width: w }}>
      <span className="gc-sr">{name}</span>
      <span className="gc__ribbon-text" aria-hidden="true">
        {chars.map((ch, i) => {
          const u = 0.5 + ((i + 0.5 - chars.length / 2) * RIBBON_FONT) / w
          const dy = h * 1.12 * (u - 0.5) ** 2
          const deg = (Math.atan((2.24 * h * (u - 0.5)) / w) * 180) / Math.PI
          return (
            <span key={i} style={{ transform: `translateY(${dy.toFixed(1)}px) rotate(${deg.toFixed(1)}deg)` }}>
              {ch}
            </span>
          )
        })}
      </span>
    </span>
  )
}

export function NewBadge() {
  return (
    <span className="gc__new">
      <span className="gc-sr">NEW!</span>
    </span>
  )
}

export function GachaScreen({ coins, owned, pullsSinceFive, busy, error, onDraw, onClose }: Props) {
  const [shown, setShown] = useState(0) // 真ん中に見せているキャラ（入っているキャラを順に）
  const [ratesOpen, setRatesOpen] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setShown((i) => (i + 1) % POOL.length), SHOWCASE_MS)
    return () => clearInterval(t)
  }, [])
  const c = POOL[shown]
  const have = coins ?? 0
  return (
    <section className="gc" aria-label="ガチャ">
      <header className="gc__bar">
        <button type="button" className="gc__back" aria-label="戻る" onClick={onClose}>
          <Icon name="back" size={20} />
        </button>
        <span className="gc__coins" aria-label={`コイン ${have}`}>
          <CoinIcon size={22} />
          {coins === null ? '…' : have.toLocaleString()}
        </span>
      </header>

      <div className="gc__sign">
        <h1>グルメキャラガチャ</h1>
        <p>いろんなグルメの仲間たちと出会おう！</p>
      </div>

      {/* 台と光の柱は動かさず、★・名前・キャラだけを入れ替える（2026-11-17 オーナー） */}
      <div className="gc__show">
        <span className="gc-swap" key={`s${c.id}`}>
          <Stars n={c.rarity ?? 3} />
        </span>
        <span className="gc-swap" key={`r${c.id}`}>
          <RibbonName name={c.name} />
        </span>
        <div className="gc__stage">
          <span className="gc__glow" aria-hidden="true" />
          <img className="gc-swap" key={`c${c.id}`} src={standArtUrl(c.id)} alt="" />
          {!owned.has(c.id) && <NewBadge key={`n${c.id}`} />}
        </div>
      </div>

      {error && (
        <p className="gc__error" role="alert">
          {error}
        </p>
      )}

      <div className="gc__buttons">
        <button type="button" className="gc__btn" disabled={busy || have < DRAW_COST.single} onClick={() => onDraw('single')}>
          <b>1回まわす</b>
          <span className="gc__cost">
            <CoinIcon size={18} />
            {DRAW_COST.single}
          </span>
        </button>
        <button type="button" className="gc__btn gc__btn--ten" disabled={busy || have < DRAW_COST.ten} onClick={() => onDraw('ten')}>
          <span className="gc__tag">★4以上1体確定！</span>
          <b>10回まわす</b>
          <span className="gc__cost">
            <CoinIcon size={18} />
            {DRAW_COST.ten.toLocaleString()}
          </span>
        </button>
      </div>

      <div className="gc__foot">
        <span className="gc__ceil">{`★5 確定まで あと ${untilCeiling(pullsSinceFive)} 回`}</span>
        <button type="button" className="gc__rates-btn" onClick={() => setRatesOpen(true)}>
          出る確率
        </button>
      </div>

      {ratesOpen && (
        <div className="gc-rates" role="dialog" aria-label="出る確率" onClick={() => setRatesOpen(false)}>
          <div className="gc-rates__box" onClick={(e) => e.stopPropagation()}>
            <b>出る確率</b>
            {([5, 4, 3] as Rarity[]).map((r) => (
              <div key={r} className="gc-rates__row">
                <div className="gc-rates__head">
                  <Stars n={r} />
                  <span>{`${RATES[r]}%`}</span>
                </div>
                <p>{POOL.filter((p) => p.rarity === r).map((p) => p.name).join('・')}</p>
              </div>
            ))}
            <p className="gc-rates__note">同じ★の中では、どのキャラも同じ確率です。10回まわすと★4以上が1体確定。まわした回数が30回になるまでに★5が1体確定します。</p>
            <button type="button" className="gc-rates__close" onClick={() => setRatesOpen(false)}>
              とじる
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
