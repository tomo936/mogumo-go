// 探索シート。今日の気配3件だけを出す（店名は明かすまで伏せる）。状態ごとの文もここで出す。
import '../../checkin/ui/checkin.css'
import type { Shop } from '../../shops/domain/shop.ts'
import { genreLabel, hintLines, roundDistance } from '../domain/hint.ts'
import type { DailyHint, HintSet } from '../domain/hint.ts'
import type { ExploreStatus } from './useDailyHints.ts'
import './hints.css'
import { DoneMark } from '../../ui/DoneMark.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { useState } from 'react'
import { catchLabel } from '../domain/hint.ts'
import { kindFromGenre, untilResetLabel } from '../domain/sheetText.ts'

// 霧の窓の奥にぼかして出す料理の絵（実績のメダルと同じ、ピンの枠の無い絵）
const FOOD = import.meta.glob<string>('../../assets/badges/food/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const foodUrl = (kind: string) => FOOD[`../../assets/badges/food/${kind}.webp`]
const REWARD = 40 // チェックイン 30 ＋ 気配のボーナス 10

type Props = {
  placement?: 'bottom' | 'top' // 上の気配ボタンから降りる（2026-11-10）
  status: ExploreStatus
  set: HintSet | null
  revealed: ReadonlySet<string>
  distances: ReadonlyMap<string, number>
  directions?: ReadonlyMap<string, string | null> // 気配への向き（「北東」など）
  regenVisible: boolean
  fast: boolean
  notice: string | null
  guide: { shop: Shop; distanceM: number }[]
  onPickHint: (id: string) => void
  onPickShop: (shop: Shop) => void
  onRegen: () => void
  onRetry: () => void
  onClose: () => void
}

const STATUS_TEXT: Partial<Record<ExploreStatus, string>> = {
  loading: '気配を探しています…',
  fast: '降りたら今日の気配が出るよ',
  unavailable: 'いまは気配を探せません',
  timeout: 'いまは気配を探せません。少し歩いてから開き直してね',
  error: '気配を読み込めませんでした',
}

function Row({ h, revealed, distanceM, direction, onPick }: { h: DailyHint; revealed: boolean; distanceM: number | undefined; direction: string | null; onPick: () => void }) {
  const open = h.completed || revealed
  const kind = kindFromGenre(h.genre)
  const catchText = h.isMystery ? null : catchLabel(h.catch)
  const dist = distanceM !== undefined ? `${direction ? `${direction}へ ` : ''}約${roundDistance(distanceM)}m` : null
  const cls = `hint-card${h.isMystery ? ' hint-card--mystery' : ''}${open ? ' hint-card--open' : ''}${h.completed ? ' hint-card--done' : ''}`
  return (
    <li>
      <button type="button" className={cls} onClick={onPick}>
        {/* 霧の窓: 奥に料理の絵をぼかして、雲と「？」。明かしたら晴れる */}
        <span className="hint-card__window" aria-hidden="true">
          {!h.isMystery && foodUrl(kind) && <img src={foodUrl(kind)} alt="" />}
          {!open && (
            <>
              <i className="hint-card__puff hint-card__puff--a" />
              <i className="hint-card__puff hint-card__puff--b" />
              <i className="hint-card__puff hint-card__puff--c" />
              <b className="hint-card__q">？</b>
            </>
          )}
          {h.completed && (
            <span className="hint-card__done">
              <DoneMark size={26} />
            </span>
          )}
        </span>
        <span className="hint-card__body">
          {open ? (
            <>
              <span className="hint-card__name">{`『${h.shop.name}』`}</span>
              <span className="hint-card__sub">{h.completed ? '気配の正体を見つけた！' : '見つけた！'}</span>
            </>
          ) : (
            <>
              <span className="hint-card__genre">{genreLabel(h)}</span>
              {h.isMystery ? (
                <span className="hint-card__sub">{hintLines(h)[0]}</span>
              ) : (
                catchText && <span className="hint-card__sub">{catchText}</span>
              )}
              {!h.isMystery && h.budget && <span className="hint-card__chip">{`予算 ${h.budget}`}</span>}
            </>
          )}
          {dist && !h.completed && (
            <span className="hint-card__dist">
              <Icon name="pin" size={14} />
              {dist}
            </span>
          )}
        </span>
        {h.completed ? (
          <span className="hint-card__stamp">{`達成 +${REWARD}`}</span>
        ) : (
          <span className="hint-card__reward">{`+${REWARD}`}</span>
        )}
      </button>
    </li>
  )
}

export function ExploreSheet(p: Props) {
  const hints = p.set?.hints ?? []
  const [openedAt] = useState(() => new Date()) // 入れかわりまでの時間は開いた時刻で
  const waiting = hints.filter((h) => !h.completed).length
  const text = STATUS_TEXT[p.status]
  const none = p.status === 'ready' && hints.length === 0
  return (
    <section className={`shop-sheet explore-sheet${p.placement === 'top' ? ' explore-sheet--top' : ''}`} aria-label="探索">
      <button type="button" className="shop-sheet__close" aria-label="閉じる" onClick={p.onClose}>
        <Icon name="close" size={16} />
      </button>
      <div className="explore-sheet__head">
        <h2 className="shop-sheet__name">今日の気配</h2>
        {hints.length > 0 && (
          <p className="explore-sheet__meta">
            {`霧の中に ${waiting}つの気配`}
            <br />
            入れかわりまで <b>{untilResetLabel(openedAt)}</b>
          </p>
        )}
      </div>
      {text && <p className="explore-sheet__status" role="status">{text}</p>}
      {p.status === 'error' && (
        <button type="button" className="explore-sheet__retry" onClick={p.onRetry}>
          もう一度
        </button>
      )}
      {hints.length > 0 && (
        <ul className="hint-list">
          {hints.map((h) => (
            <Row key={h.id} h={h} revealed={p.revealed.has(h.id)} distanceM={p.distances.get(h.id)} direction={p.directions?.get(h.id) ?? null} onPick={() => p.onPickHint(h.id)} />
          ))}
        </ul>
      )}
      {none && (
        <div className="explore-sheet__none">
          <p className="explore-sheet__status">今日は気配なし</p>
          {p.guide.length > 0 ? (
            <>
              <p className="hint-note">近くのまだ行っていないお店</p>
              <ul className="hint-list">
                {p.guide.map((g) => (
                  <li key={g.shop.id}>
                    <button type="button" className="hint-row" onClick={() => p.onPickShop(g.shop)}>
                      <span className="hint-row__body">
                        <span className="hint-row__title">{g.shop.name}</span>
                        <span className="hint-row__dist">{`約${roundDistance(g.distanceM)}m`}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="hint-note">近くにまだ行っていないお店はありません</p>
          )}
        </div>
      )}
      {p.notice && <p className="explore-sheet__notice" role="status">{p.notice}</p>}
      {p.regenVisible && (
        <>
          <button type="button" className="explore-sheet__regen" disabled={p.fast} onClick={p.onRegen}>
            この辺りで探し直す
          </button>
          {p.fast && <p className="hint-note">降りてから探し直してね</p>}
        </>
      )}
      <p className="hint-note">気配は毎日0時に入れかわります</p>
    </section>
  )
}
