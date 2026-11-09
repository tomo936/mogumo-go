// 気配（店名を伏せたまま）を押したときのシート。店名は出さず、距離とヒントだけ。
import '../../checkin/ui/checkin.css'
import { HINT_REVEAL_M } from '../config.ts'
import { distanceLabel, hintLines } from '../domain/hint.ts'
import type { DailyHint } from '../domain/hint.ts'
import './hints.css'

type Props = { hint: DailyHint; distanceM: number | null; onClose: () => void }

export function HintSheet({ hint, distanceM, onClose }: Props) {
  return (
    <section className="shop-sheet" aria-label="気配">
      <button type="button" className="shop-sheet__close" aria-label="閉じる" onClick={onClose}>
        ×
      </button>
      <div className="shop-sheet__head">
        <span className={`hint-badge${hint.isMystery ? ' hint-badge--mystery' : ''}`} aria-hidden="true">?</span>
        <div>
          <h2 className="shop-sheet__name">？？？</h2>
          {distanceM !== null && <p className="shop-sheet__distance">{distanceLabel(distanceM)}</p>}
        </div>
      </div>
      <ul className="hint-lines">
        {hintLines(hint).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="hint-note">{`近づくと正体が分かるよ（${HINT_REVEAL_M}m）`}</p>
    </section>
  )
}
