// 近くのお店の一覧（A11、全画面）。徒歩圏内の、晴れた場所のお店を近い順に。ジャンルで絞り込める。
// 押すとそのお店へカメラを寄せてお店のシートを開く（呼び出し側 onPick）。仕様: docs/superpowers/specs/2026-11-16-nearby-list-design.md
import { useEffect, useMemo, useRef, useState } from 'react'
import './nearby.css'
import type { Cleared } from '../../fog/domain/clearing.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { Shop, ShopKind } from '../../shops/domain/shop.ts'
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'
import { kindIcon } from '../../zukan/ui/cardArt.ts'
import { Icon } from '../../ui/Icon.tsx'
import { DoneMark } from '../../ui/DoneMark.tsx'
import { WALK_RADIUS_M, kindsIn, nearbyShops } from '../domain/nearby.ts'

type Props = {
  shops: readonly Shop[] // 今の地図のお店
  me: LatLng | null // 今いる場所（まだ取れていなければ null）
  cleared: Cleared
  checked: ReadonlySet<string> // 済みのお店の id
  hiddenIds: ReadonlySet<string> // 正体を伏せたままの気配の店（出さない）
  onPick: (shop: Shop) => void
  onClose: () => void
}

export const SLIDE_MS = 220 // 右から滑って出る・右へ滑って閉じる時間（nearby.css の nb-in / nb-out と同じ）

const distanceText = (m: number) => `${Math.max(10, Math.round(m / 10) * 10)}m`

export function NearbyList({ shops, me, cleared, checked, hiddenIds, onPick, onClose }: Props) {
  const [kind, setKind] = useState<ShopKind | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  // 閉じるときは右へ滑ってから、呼び出し側に知らせる（二重に押されても 1 回だけ）
  const leave = (after: () => void) => {
    if (leaving) return
    setLeaving(true)
    timer.current = setTimeout(after, SLIDE_MS)
  }
  const all = useMemo(() => (me ? nearbyShops(shops, me, cleared, null, hiddenIds) : []), [shops, me, cleared, hiddenIds])
  const kinds = useMemo(() => kindsIn(all), [all])
  const list = kind ? all.filter((x) => x.shop.kind === kind) : all
  return (
    <section className={leaving ? 'nb nb--leaving' : 'nb'} aria-label="近くのお店">
      <header className="nb__bar">
        <button type="button" className="nb__back" aria-label="戻る" onClick={() => leave(onClose)}>
          <Icon name="back" size={20} />
        </button>
        <h2>近くのお店</h2>
        <small>{`徒歩圏内（${WALK_RADIUS_M}m）`}</small>
      </header>

      {!me ? (
        <p className="nb__empty">現在地を取っています。少し待ってからもう一度開いてください。</p>
      ) : all.length === 0 ? (
        <p className="nb__empty">歩いて行ける範囲に、晴れたお店がまだありません。歩いて霧を晴らそう！</p>
      ) : (
        <>
          <div className="nb__chips" role="group" aria-label="ジャンルで絞り込む">
            <button type="button" className={kind === null ? 'nb__chip is-on' : 'nb__chip'} aria-pressed={kind === null} onClick={() => setKind(null)}>
              {`すべて ${all.length}`}
            </button>
            {kinds.map(([k, n]) => (
              <button key={k} type="button" className={kind === k ? 'nb__chip is-on' : 'nb__chip'} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
                <img src={kindIcon(k)} alt="" />
                {`${KIND_LABEL[k]} ${n}`}
              </button>
            ))}
          </div>
          <ul className="nb__list">
            {list.map(({ shop, distanceM }) => (
              <li key={shop.id}>
                <button type="button" className="nb__row" onClick={() => leave(() => onPick(shop))}>
                  <img className="nb__icon" src={kindIcon(shop.kind)} alt="" />
                  <span className="nb__body">
                    <b>{shop.name}</b>
                    <small>{KIND_LABEL[shop.kind]}</small>
                  </span>
                  {checked.has(shop.id) && <DoneMark size={20} />}
                  <span className="nb__dist">{distanceText(distanceM)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
