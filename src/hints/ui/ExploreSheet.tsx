// 探索シート。今日の気配3件だけを出す（店名は明かすまで伏せる）。状態ごとの文もここで出す。
import '../../checkin/ui/checkin.css'
import type { Shop } from '../../shops/domain/shop.ts'
import { distanceLabel, genreLabel, hintLines, roundDistance } from '../domain/hint.ts'
import type { DailyHint, HintSet } from '../domain/hint.ts'
import type { ExploreStatus } from './useDailyHints.ts'
import './hints.css'

type Props = {
  status: ExploreStatus
  set: HintSet | null
  revealed: ReadonlySet<string>
  distances: ReadonlyMap<string, number>
  regenVisible: boolean
  fast: boolean
  notice: string | null
  guide: { shop: Shop; distanceM: number }[]
  onPickHint: (id: string) => void
  onPickShop: (shop: Shop) => void
  onRegen: () => void
  onRetry: () => void
  onOpenZukan: () => void // 図鑑（行ったお店・見つけたお店）
  onClose: () => void
}

const STATUS_TEXT: Partial<Record<ExploreStatus, string>> = {
  loading: '気配を探しています…',
  fast: '降りたら今日の気配が出るよ',
  unavailable: 'いまは気配を探せません',
  timeout: 'いまは気配を探せません。少し歩いてから開き直してね',
  error: '気配を読み込めませんでした',
}

function Row({ h, revealed, distanceM, onPick }: { h: DailyHint; revealed: boolean; distanceM: number | undefined; onPick: () => void }) {
  const open = h.completed || revealed
  const dist = distanceM !== undefined ? distanceLabel(distanceM) : null
  return (
    <li>
      <button type="button" className={`hint-row${h.completed ? ' hint-row--done' : ''}`} onClick={onPick}>
        <span className={`hint-badge${h.isMystery ? ' hint-badge--mystery' : ''}${open ? ' hint-badge--open' : ''}`} aria-hidden="true">
          {h.completed ? '✓' : open ? '!' : '?'}
        </span>
        <span className="hint-row__body">
          {open ? (
            <>
              <span className="hint-row__title">{`『${h.shop.name}』`}</span>
              <span className="hint-row__sub">{h.completed ? '達成 +10' : '見つけた！'}</span>
            </>
          ) : (
            <>
              <span className="hint-row__title">{genreLabel(h)}</span>
              {hintLines(h).slice(h.isMystery ? 0 : 1).map((l) => (
                <span key={l} className="hint-row__sub">{l}</span>
              ))}
            </>
          )}
          {dist && <span className="hint-row__dist">{dist}</span>}
        </span>
      </button>
    </li>
  )
}

export function ExploreSheet(p: Props) {
  const hints = p.set?.hints ?? []
  const text = STATUS_TEXT[p.status]
  const none = p.status === 'ready' && hints.length === 0
  return (
    <section className="shop-sheet explore-sheet" aria-label="探索">
      <button type="button" className="shop-sheet__close" aria-label="閉じる" onClick={p.onClose}>
        ×
      </button>
      <h2 className="shop-sheet__name">今日の気配</h2>
      {text && <p className="explore-sheet__status" role="status">{text}</p>}
      {p.status === 'error' && (
        <button type="button" className="explore-sheet__retry" onClick={p.onRetry}>
          もう一度
        </button>
      )}
      {hints.length > 0 && (
        <ul className="hint-list">
          {hints.map((h) => (
            <Row key={h.id} h={h} revealed={p.revealed.has(h.id)} distanceM={p.distances.get(h.id)} onPick={() => p.onPickHint(h.id)} />
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
      <button type="button" className="explore-sheet__zukan" onClick={p.onOpenZukan}>
        図鑑を見る
      </button>
      <a className="hint-credit" href="http://webservice.recruit.co.jp/" target="_blank" rel="noreferrer">
        Powered by ホットペッパーグルメ Webサービス
      </a>
    </section>
  )
}
