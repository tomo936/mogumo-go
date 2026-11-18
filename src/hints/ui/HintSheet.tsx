// 気配（店名を伏せたまま）を押したときのシート。店名は出さず、霧の窓・ジャンル・ひとこと・予算・向きと距離だけ。
// 見た目は気配の一覧（ExploreSheet）のカードを大きくした手帳風（2026-11-10）
import '../../checkin/ui/checkin.css'
import { HINT_REVEAL_M } from '../config.ts'
import { budgetLabel, catchLabel, genreLabel, MYSTERY_TEXT, roundDistance } from '../domain/hint.ts'
import type { DailyHint } from '../domain/hint.ts'
import { kindFromGenre } from '../domain/sheetText.ts'
import { Icon } from '../../ui/Icon.tsx'
import './hints.css'

const FOOD = import.meta.glob<string>('../../assets/badges/food/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const foodUrl = (kind: string) => FOOD[`../../assets/badges/food/${kind}.webp`]
const REWARD = 40 // チェックイン 30 ＋ 気配のボーナス 10（ExploreSheet と同じ）

type Props = { hint: DailyHint; distanceM: number | null; direction?: string | null; onClose: () => void }

export function HintSheet({ hint, distanceM, direction = null, onClose }: Props) {
  const food = hint.isMystery ? undefined : foodUrl(kindFromGenre(hint.genre))
  const catchText = hint.isMystery ? MYSTERY_TEXT : catchLabel(hint.catch)
  const budget = hint.isMystery ? null : budgetLabel(hint.budget)
  return (
    <section className={`shop-sheet hint-one${hint.isMystery ? ' hint-one--mystery' : ''}`} aria-label="気配">
      <button type="button" className="shop-sheet__close" aria-label="閉じる" onClick={onClose}>
        <Icon name="close" size={16} />
      </button>
      <div className="hint-one__top">
        <span className="hint-card__window hint-one__window" aria-hidden="true">
          {food && <img src={food} alt="" />}
          <i className="hint-card__puff hint-card__puff--a" />
          <i className="hint-card__puff hint-card__puff--b" />
          <i className="hint-card__puff hint-card__puff--c" />
          <b className="hint-card__q">？</b>
        </span>
        <div className="hint-one__body">
          <p className="hint-one__kicker">霧の中の気配</p>
          <h2 className="hint-one__genre">{genreLabel(hint)}</h2>
          {catchText && <p className="hint-one__catch">{catchText}</p>}
          {budget && <span className="hint-card__chip">{budget}</span>}
        </div>
      </div>
      <div className="hint-one__facts">
        {distanceM !== null && (
          <span className="hint-one__dist">
            <Icon name="pin" size={16} />
            {`${direction ? `${direction}へ ` : 'ここから '}約${roundDistance(distanceM)}m`}
          </span>
        )}
        <span className="hint-one__reward">{`見つけたら +${REWARD}`}</span>
      </div>
      <p className="hint-one__note">{`${HINT_REVEAL_M}m まで近づくと正体が分かるよ`}</p>
    </section>
  )
}
