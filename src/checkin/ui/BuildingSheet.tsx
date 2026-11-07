// ビル（同じ建物に複数のお店）をタップしたときの、お店の一覧のシート。行を押すとそのお店のシートへ。
import './checkin.css'
import { BADGE_COLOR } from '../../shops/domain/badgeColor.ts'
import type { Shop } from '../../shops/domain/shop.ts'

type Props = {
  shops: Shop[]
  title?: string | null // 施設・駅の名前（無ければ「このビルのお店」）
  checkedIds: ReadonlySet<string>
  onPick: (shop: Shop) => void
  onClose: () => void
}

export function BuildingSheet({ shops, checkedIds, title, onPick, onClose }: Props) {
  // 同じ建物なので距離はほぼ同じ。名前の順に並べる
  const sorted = [...shops].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  const done = shops.filter((s) => checkedIds.has(s.id)).length
  return (
    <section className="shop-sheet" aria-label="ビルのお店">
      <button type="button" className="shop-sheet__close" aria-label="閉じる" onClick={onClose}>
        ×
      </button>
      <div className="bldg-sheet__head">
        <h2 className="shop-sheet__name">{title ?? 'このビルのお店'}</h2>
        <span className="bldg-sheet__done">{`済み ${done}/${shops.length}`}</span>
      </div>
      <ul className="bldg-sheet__list">
        {sorted.map((s) => (
          <li key={s.id}>
            <button type="button" className="bldg-sheet__row" onClick={() => onPick(s)}>
              <span className="bldg-sheet__badge" style={{ background: BADGE_COLOR[s.kind] }} aria-hidden="true" />
              <span className="bldg-sheet__name">{s.name}</span>
              {checkedIds.has(s.id) && <span className="bldg-sheet__check">✓</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
