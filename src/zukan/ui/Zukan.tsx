// 図鑑（お店図鑑・手帳風）。行ったお店は写真つきのポラロイド（訪問済みのスタンプ）、
// 見つけたけど行っていないお店は「？？？」（写真はぼかす・ジャンルとキャッチだけ）。
// 仕様: docs/superpowers/specs/2026-11-10-zukan-design.md
import { useEffect, useMemo, useState } from 'react'
import './zukan.css'
import type { ShopKind } from '../../shops/domain/shop.ts'
import { frameTier } from '../../checkin/domain/visits.ts'
import { KIND_ORDER, PAGE_SIZE, buildZukan, filledCount, pageCount, type ZukanShop } from '../domain/zukan.ts'
import { loadZukan } from '../infra/zukanApi.ts'

const KIND_NAME: Record<ShopKind, string> = {
  ramen: 'ラーメン', sushi: '寿司', soba: 'そば', washoku: '和食', izakaya: '居酒屋', chinese: '中華', yakiniku: '焼肉',
  western: '洋食', curry: 'カレー', cafe: 'カフェ', cake: 'スイーツ', bakery: 'パン', donburi: '丼もの', burger: 'ハンバーガー',
  ethnic: 'エスニック', okonomiyaki: 'お好み焼き', takoyaki: 'たこ焼き', mystery: 'その他',
}

const cards = import.meta.glob('../../assets/shops/cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const cardUrl = (kind: ShopKind) => cards[`../../assets/shops/cards/${kind}.webp`] ?? cards['../../assets/shops/cards/mystery.webp']

type Props = {
  onPick: (shop: ZukanShop) => void
  onClose: () => void
}

export function Zukan({ onPick, onClose }: Props) {
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

  return (
    <section className="zukan" aria-label="図鑑">
      <header className="zukan__banner">
        <button type="button" className="zukan__close" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
        <h2 className="zukan__title">お店図鑑</h2>
        {byKind && (
          <div className="zukan__progress">
            <span>{`あなたのお店コレクション ${filledAll}/${total} 訪問済み`}</span>
            <div className="zukan__bar" role="img" aria-label={`${percent}%`}>
              <i style={{ width: `${percent}%` }} />
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
                {KIND_NAME[k]}
              </button>
            ))}
          </nav>

          <div className="zukan__summary">
            <span>{KIND_NAME[kind]}</span>
            <b>{`${filledCount(list)}/${list.length}`}</b>
          </div>

          {list.length === 0 ? (
            <p className="zukan__note">まだ見つけたお店がありません。街を歩いて探してみてね</p>
          ) : (
            <>
              <ul className="zukan__grid">
                {shown.map((s) => (
                  <li key={s.id}>
                    {s.visits ? (
                      <button
                        type="button"
                        className={`zukan__card zukan__card--visited zukan__card--${frameTier(s.visits.count)}`}
                        onClick={() => onPick(s)}
                        aria-label={`${s.name} ${s.visits.count}回行った`}
                      >
                        <span className="zukan__name">{s.name}</span>
                        <span className="zukan__polaroid">
                          {s.photoUrl ? <img src={s.photoUrl} alt="" /> : <img src={cardUrl(s.kind)} alt="" className="zukan__model" />}
                        </span>
                        <span className="zukan__stamp">訪問済み</span>
                        <span className="zukan__chip">{KIND_NAME[s.kind]}</span>
                      </button>
                    ) : (
                      <div className="zukan__card zukan__card--unknown" aria-label="まだ行っていないお店">
                        <span className="zukan__name">？？？</span>
                        <span className="zukan__polaroid zukan__polaroid--blur">
                          <img src={cardUrl(s.kind)} alt="" className="zukan__model" />
                        </span>
                        <span className="zukan__chip zukan__chip--hint">{`${KIND_NAME[s.kind]}？`}</span>
                        {s.catch && <span className="zukan__hint">{s.catch}</span>}
                      </div>
                    )}
                  </li>
                ))}
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
