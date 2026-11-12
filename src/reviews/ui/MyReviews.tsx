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


function MyReview({ r, url, visitDay, onEdit }: { r: Review; url: string | undefined; visitDay: string; onEdit: () => void }) {
  return (
    <div className="rv-mine">
      <div className="rv-mine__row">
        <span className="rv-mine__stars" aria-label={`星 ${r.stars}`}>{starText(r.stars)}</span>
        {!r.isPublic && <span className="rv-mine__private">🔒 自分だけ</span>}
        <span className="rv-mine__day">{visitDay.replaceAll('-', '.')}</span>
      </div>
      <button type="button" className="rv-mine__edit" aria-label={`${visitDay.replaceAll('-', '.')} の感想を直す`} onClick={onEdit}>
        <span aria-hidden="true">✎</span>
      </button>
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
  // 開いているエディター: どの訪問の感想か（新しく書く・前の感想を直す）
  const [editing, setEditing] = useState<{ checkinId: string; day: string; existing: Review | null } | null>(null)

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
  const dayOf = (checkinId: string) => {
    const v = typeof data === 'object' ? data.visits.find((x) => x.checkinId === checkinId) : undefined
    return v ? jstDay(new Date(v.checkedInAt)) : ''
  }
  const edit = (r: Review) => setEditing({ checkinId: r.checkinId, day: dayOf(r.checkinId), existing: r })
  const writeLatest = () => target && setEditing({ checkinId: target.checkinId, day: dayOf(target.checkinId), existing: target.existing })
  const [first, ...older] = ordered

  return (
    <div className="zd-box">
      <h3 className="zd-box__title">わたしの感想</h3>
      {data === 'loading' && <p className="zd-box__note">読み込んでいます…</p>}
      {data === 'error' && <p className="zd-box__note">感想を読み込めませんでした</p>}
      {/* 「書く」= 新しい感想（いちばん新しい訪問の分）。欄のいちばん上の白紙のカード。
          感想は 1 回の訪問に 1 件（D-03）なので、もう書いてあれば同じ場所に「次に行ったら」と出す（2026-11-13 オーナー） */}
      {target &&
        (target.existing ? (
          <div className="rv-write rv-write--done">
            <span aria-hidden="true">✎</span>次に行ったら新しく書けます
          </div>
        ) : (
          <button type="button" className="rv-write" aria-label="書く" onClick={writeLatest}>
            <span aria-hidden="true">＋</span>
            {`${dayOf(target.checkinId).slice(5).replace('-', '/')} の感想を書く`}
          </button>
        ))}
      {typeof data === 'object' && first && (
        <>
          <MyReview r={first} url={urls.get(first.photoPath ?? '')} visitDay={dayOf(first.checkinId)} onEdit={() => edit(first)} />
          {older.length > 0 && (
            <details className="rv-older">
              <summary>{`前の感想（${older.length}件）`}</summary>
              {older.map((r) => (
                <MyReview key={r.id} r={r} url={urls.get(r.photoPath ?? '')} visitDay={dayOf(r.checkinId)} onEdit={() => edit(r)} />
              ))}
            </details>
          )}
        </>
      )}
      {typeof data === 'object' && !first && !target && <p className="zd-box__note">まだ感想がありません</p>}
      {editing && (
        <ReviewEditor
          shopName={shopName}
          shopId={shopId}
          checkinId={editing.checkinId}
          visitDay={editing.day}
          existing={editing.existing}
          existingPhotoUrl={editing.existing?.photoPath ? (urls.get(editing.existing.photoPath) ?? null) : null}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
          onDeleted={() => {
            setEditing(null)
            reload()
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
