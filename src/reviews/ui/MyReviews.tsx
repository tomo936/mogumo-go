// 図鑑の詳細の「わたしの感想」。いちばん新しい訪問の感想を出し、前の感想はたたんで並べる。
import { useCallback, useEffect, useState } from 'react'
import './reviews.css'
import { jstDay } from '../../checkin/domain/day.ts'
import { myReviewsByVisit, targetCheckin } from '../domain/review.ts'
import type { Review, VisitRef } from '../domain/review.ts'
import { loadMine, photoUrls } from '../infra/reviewsApi.ts'
import { ReviewEditor } from './ReviewEditor.tsx'
import { starText } from '../../zukan/ui/cardArt.ts'

type Props = { shopId: string; shopName: string; load?: typeof loadMine; photos?: typeof photoUrls }

const dotted = (iso: string) => jstDay(new Date(iso)).replaceAll('-', '.')

function MyReview({ r, url }: { r: Review; url: string | undefined }) {
  return (
    <div className="rv-mine">
      <div className="rv-mine__row">
        <span className="rv-mine__stars" aria-label={`星 ${r.stars}`}>{starText(r.stars)}</span>
        {!r.isPublic && <span className="rv-mine__private">🔒 自分だけ</span>}
        <span className="rv-mine__day">{dotted(r.createdAt)}</span>
      </div>
      {r.body && <p className="rv-mine__memo">{r.body}</p>}
      {r.photoPath && url && (
        <div className="rv-polaroid">
          <span className="rv-polaroid__tape" aria-hidden="true" />
          <img src={url} alt="自分の写真" />
        </div>
      )}
    </div>
  )
}

export function MyReviews({ shopId, shopName, load = loadMine, photos = photoUrls }: Props) {
  const [data, setData] = useState<{ visits: VisitRef[]; mine: Review[] } | 'loading' | 'error'>('loading')
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [editing, setEditing] = useState(false)

  const reload = useCallback(() => {
    let alive = true
    load(shopId)
      .then((d) => {
        if (!alive) return
        setData(d)
        const paths = d.mine.flatMap((r) => (r.photoPath ? [r.photoPath] : []))
        photos(paths).then((m) => alive && setUrls(m)).catch(() => {})
      })
      .catch(() => alive && setData('error'))
    return () => {
      alive = false
    }
  }, [shopId, load, photos])

  useEffect(() => reload(), [reload])

  const ordered = typeof data === 'object' ? myReviewsByVisit(data.visits, data.mine) : []
  const target = typeof data === 'object' ? targetCheckin(data.visits, data.mine) : null
  const targetVisit = typeof data === 'object' && target ? data.visits.find((v) => v.checkinId === target.checkinId) : undefined
  const [first, ...older] = ordered

  return (
    <div className="zd-box">
      <h3 className="zd-box__title">
        わたしの感想
        {target && ordered.length > 0 && (
          <button type="button" className="zd-box__ed" onClick={() => setEditing(true)}>
            書く・直す
          </button>
        )}
      </h3>
      {data === 'loading' && <p className="zd-box__note">読み込んでいます…</p>}
      {data === 'error' && <p className="zd-box__note">感想を読み込めませんでした</p>}
      {typeof data === 'object' &&
        (first ? (
          <>
            <MyReview r={first} url={urls.get(first.photoPath ?? '')} />
            {older.length > 0 && (
              <details className="rv-older">
                <summary>{`前の感想（${older.length}件）`}</summary>
                {older.map((r) => (
                  <MyReview key={r.id} r={r} url={urls.get(r.photoPath ?? '')} />
                ))}
              </details>
            )}
          </>
        ) : (
          <div className="zd-box__empty">
            <p className="zd-box__note">まだ感想がありません</p>
            {target && (
              <button type="button" className="zd-box__write" onClick={() => setEditing(true)}>
                感想を書く
              </button>
            )}
          </div>
        ))}
      {editing && target && targetVisit && (
        <ReviewEditor
          shopName={shopName}
          shopId={shopId}
          checkinId={target.checkinId}
          visitDay={jstDay(new Date(targetVisit.checkedInAt))}
          existing={target.existing}
          existingPhotoUrl={target.existing?.photoPath ? (urls.get(target.existing.photoPath) ?? null) : null}
          onSaved={() => {
            setEditing(false)
            reload()
          }}
          onDeleted={() => {
            setEditing(false)
            reload()
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}
