// 図鑑の詳細の「みんなの感想」。他人の公開の感想だけ（RLS が守る）。10 件ずつ、写真は押すと大きく、「⋯」から通報。
import { useEffect, useState } from 'react'
import './reviews.css'
import type { Review } from '../domain/review.ts'
import { loadOthers, loadSummary, photoUrls, reportReview } from '../infra/reviewsApi.ts'
import { starText } from '../../zukan/ui/cardArt.ts'

type Props = {
  shopId: string
  load?: typeof loadOthers
  summary?: typeof loadSummary
  report?: typeof reportReview
  photos?: typeof photoUrls
}

const AV_COLORS = ['#e8782f', '#7fb8e6', '#8cc56b', '#c79be0', '#f2a93b']
const avColor = (userId: string) => AV_COLORS[[...userId].reduce((s, c) => s + c.charCodeAt(0), 0) % AV_COLORS.length]

function Item({ r, url, onZoom, report }: { r: Review; url: string | undefined; onZoom: (u: string) => void; report: typeof reportReview }) {
  const name = r.nickname ?? 'だれか'
  const [menu, setMenu] = useState<'closed' | 'confirm' | 'sending' | 'done' | 'error'>('closed')
  async function send() {
    setMenu('sending')
    try {
      await report(r.id)
      setMenu('done')
    } catch {
      setMenu('error')
    }
  }
  return (
    <li className="rv-item">
      <span className="rv-item__av" style={{ background: avColor(r.userId) }} aria-hidden="true">
        {[...name][0]}
      </span>
      <div className="rv-item__body">
        <div className="rv-item__name">
          {name}
          <span aria-label={`星 ${r.stars}`}>{starText(r.stars)}</span>
        </div>
        {r.body && <p>{r.body}</p>}
        {r.photoPath && url && (
          <button type="button" className="rv-item__photo" aria-label="写真を大きく見る" onClick={() => onZoom(url)}>
            <img src={url} alt="" />
          </button>
        )}
        {menu === 'confirm' && (
          <div className="rv-item__confirm">
            <span>この感想を通報しますか？</span>
            <button type="button" className="rv-item__report" onClick={send}>
              通報する
            </button>
            <button type="button" className="rv-item__cancel" onClick={() => setMenu('closed')}>
              やめる
            </button>
          </div>
        )}
        {menu === 'sending' && <p className="rv-item__msg">送っています…</p>}
        {menu === 'done' && <p className="rv-item__msg">通報しました</p>}
        {menu === 'error' && <p className="rv-item__msg">通報できませんでした</p>}
      </div>
      <button type="button" className="rv-item__more" aria-label={`${name} さんの感想のメニュー`} onClick={() => setMenu(menu === 'confirm' ? 'closed' : 'confirm')} disabled={menu === 'done' || menu === 'sending'}>
        ⋯
      </button>
    </li>
  )
}

export function ReviewList({ shopId, load = loadOthers, summary = loadSummary, report = reportReview, photos = photoUrls }: Props) {
  const [items, setItems] = useState<Review[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [sum, setSum] = useState<{ avg: number; count: number } | null>(null)
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [zoom, setZoom] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    summary(shopId).then((s) => alive && setSum(s)).catch(() => {})
    return () => {
      alive = false
    }
  }, [shopId, summary])

  useEffect(() => {
    let alive = true
    load(shopId, page)
      .then((res) => {
        if (!alive) return
        setItems((prev) => (page === 0 ? res.items : [...prev, ...res.items]))
        setHasMore(res.hasMore)
        setState('ready')
        const paths = res.items.flatMap((r) => (r.photoPath ? [r.photoPath] : []))
        photos(paths).then((m) => alive && setUrls((prev) => new Map([...prev, ...m]))).catch(() => {})
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [shopId, page, load, photos])

  return (
    <div className="zd-box">
      <h3 className="zd-box__title">
        みんなの感想
        {sum && <small>{`${sum.count}件`}</small>}
        {sum && <span className="zd-box__avg">{`★ ${sum.avg.toFixed(1)}`}</span>}
      </h3>
      {state === 'loading' && items.length === 0 && <p className="zd-box__note">読み込んでいます…</p>}
      {state === 'error' && items.length === 0 && <p className="zd-box__note">感想を読み込めませんでした</p>}
      {state === 'ready' && items.length === 0 && <p className="zd-box__note">まだ感想がありません</p>}
      {items.length > 0 && (
        <ul className="rv-list">
          {items.map((r) => (
            <Item key={r.id} r={r} url={r.photoPath ? urls.get(r.photoPath) : undefined} onZoom={setZoom} report={report} />
          ))}
        </ul>
      )}
      {hasMore && (
        <button type="button" className="zd-box__more" onClick={() => setPage(page + 1)}>
          もっと見る
        </button>
      )}
      {zoom && (
        <div className="rv-zoom" role="dialog" aria-label="写真">
          <img src={zoom} alt="" />
          <button type="button" className="rv-zoom__close" aria-label="写真を閉じる" onClick={() => setZoom(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
