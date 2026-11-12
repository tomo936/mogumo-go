// 図鑑（案B コレクションカード。2026-11-12 オーナー決定）。行ったお店は段（ふつう・銀・金）の枠のカード、
// 見つけたけど行っていないお店はむらさきの「カードの裏」（シルエットと「？」・キャッチだけ。押せない）。
// 仕様: docs/superpowers/specs/2026-11-12-zukan-b-reviews-design.md
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import './zukan.css'
import type { ShopKind } from '../../shops/domain/shop.ts'
import { frameTier } from '../../checkin/domain/visits.ts'
import { KIND_ORDER, PAGE_SIZE, buildZukan, cardNo, filledCount, pageCount, type ZukanShop } from '../domain/zukan.ts'
import { loadZukan } from '../infra/zukanApi.ts'
import { Icon } from '../../ui/Icon.tsx'
import { PIN_ICON } from '../../shops/infra/pinIcons.ts'
import { ZukanDetail } from './ZukanDetail.tsx'
import { cardUrl } from './cardArt.ts'
import { expFromCounts, levelFor } from '../domain/level.ts'
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'

const KIND_NAME = KIND_LABEL


type Props = {
  onLocate: (shop: ZukanShop) => void // 詳細の「地図で見る」
  onClose: () => void
}

export function Zukan({ onLocate, onClose }: Props) {
  const [detail, setDetail] = useState<{ shop: ZukanShop; no: string } | null>(null)
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; shops: ZukanShop[] }>({ status: 'loading' })
  const [kind, setKind] = useState<ShopKind>('ramen')
  const [page, setPage] = useState(0)

  useEffect(() => {
    let alive = true
    loadZukan()
      .then((shops) => alive && setState({ status: 'ready', shops }))
      .catch(() => alive && setState({ status: 'error' }))
    return () => {
      alive = false
    }
  }, [])

  const byKind = useMemo(() => (state.status === 'ready' ? buildZukan(state.shops) : null), [state])
  const all = useMemo(() => (byKind ? [...byKind.values()].flat() : []), [byKind])
  const list = byKind?.get(kind) ?? []
  const pages = pageCount(list.length)
  const current = Math.min(page, Math.max(0, pages - 1))
  const shown = list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const total = all.length
  const filledAll = filledCount(all)
  const percent = total === 0 ? 0 : Math.round((filledAll / total) * 100)
  const lv = levelFor(expFromCounts(all.map((s) => s.visits?.count ?? 0)))
  // カードの下の段: お店の特徴（ホットペッパーのひと言、無ければジャンル。2026-11-12 オーナー「感想じゃなくて特徴」）
  const feature = (s: ZukanShop) => s.catch ?? s.genreName ?? KIND_NAME[s.kind]

  if (detail) {
    return <ZukanDetail shop={detail.shop} no={detail.no} onBack={() => setDetail(null)} onLocate={() => onLocate(detail.shop)} />
  }

  return (
    <section className="zukan" aria-label="図鑑">
      <header className="zukan__banner">
        <button type="button" className="zukan__close" aria-label="閉じる" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <h2 className="zukan__title">
          <span>お店図鑑</span>
        </h2>
        {byKind && (
          <div className="zukan__progress">
            <div className="zukan__ring" style={{ '--p': percent } as CSSProperties} role="img" aria-label={`コレクション率 ${percent}%`}>
              <b>
                {percent}
                <small>%</small>
              </b>
            </div>
            <div className="zukan__pt">
              <div className="zukan__l1">
                {`Lv ${lv.level}`}
                <span>{`コレクション ${filledAll} / ${total}`}</span>
              </div>
              <div className="zukan__bar">
                <i style={{ width: `${Math.round((lv.span > 0 ? lv.into / lv.span : 0) * 100)}%` }} />
              </div>
              <div className="zukan__next">{`次の Lv まで あと ${lv.toNext} EXP`}</div>
            </div>
          </div>
        )}
      </header>

      {state.status === 'loading' && <p className="zukan__note">図鑑を開いています…</p>}
      {state.status === 'error' && <p className="zukan__note" role="alert">図鑑を読み込めませんでした</p>}

      {byKind && (
        <>
          <nav className="zukan__tabs" aria-label="ジャンル">
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                className={`zukan__tab${k === kind ? ' zukan__tab--on' : ''}`}
                aria-pressed={k === kind}
                onClick={() => {
                  setKind(k)
                  setPage(0)
                }}
              >
                <img src={PIN_ICON[k]} alt="" />
                {KIND_NAME[k]}
              </button>
            ))}
          </nav>

          <div className="zukan__summary">
            <span>{KIND_NAME[kind]}</span>
            <b aria-label={`${filledCount(list)}/${list.length} 訪問済み`}>
              {filledCount(list)}
              <small>{` / ${list.length}`}</small>
            </b>
          </div>

          {list.length === 0 ? (
            <p className="zukan__note">まだ見つけたお店がありません。街を歩いて探してみてね</p>
          ) : (
            <>
              <ul className="zukan__grid">
                {shown.map((s, i) => {
                  const no = cardNo(current * PAGE_SIZE + i)
                  if (!s.visits) {
                    return (
                      <li key={s.id}>
                        <div className="zukan__card zukan__card--unknown" aria-label="まだ行っていないお店">
                          <span className="zukan__no">{no}</span>
                          <span className="zukan__art">
                            <img src={cardUrl(s.kind)} alt="" className="zukan__model" />
                            <span className="zukan__q">？</span>
                          </span>
                          <span className="zukan__name">？？？</span>
                          <span className="zukan__foot">
                            <span className="zukan__feat">{s.catch ?? ''}</span>
                          </span>
                        </div>
                      </li>
                    )
                  }
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`zukan__card zukan__card--visited zukan__card--${frameTier(s.visits.count)}`}
                        onClick={() => setDetail({ shop: s, no })}
                        aria-label={`${s.name} ${s.visits.count}回行った`}
                      >
                        <span className="zukan__no">{no}</span>
                        <span className="zukan__art">
                          {s.photoUrl ? <img src={s.photoUrl} alt="" /> : <img src={cardUrl(s.kind)} alt="" className="zukan__model" />}
                        </span>
                        <span className="zukan__name">{s.name}</span>
                        <span className="zukan__foot">
                          <span className="zukan__feat">{feature(s)}</span>
                          <span className="zukan__cnt">{`${s.visits.count}回`}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {pages > 1 && (
                <div className="zukan__pager">
                  <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="前のページ">
                    ‹
                  </button>
                  <span>{`${current + 1} / ${pages}`}</span>
                  <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="次のページ">
                    ›
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
