// 感想を書く・直す画面（全画面のシート。案B の茶色の線と橙のボタン）。仕様: 2026-11-12-zukan-b-reviews-design.md の 3.
import { useEffect, useState } from 'react'
import './reviews.css'
import { Icon } from '../../ui/Icon.tsx'
import { REVIEW_BODY_MAX, validateDraft } from '../domain/review.ts'
import type { Review } from '../domain/review.ts'
import { deleteReview, saveReview } from '../infra/reviewsApi.ts'
import type { PhotoChange } from '../infra/reviewsApi.ts'

type Props = {
  shopName: string
  shopId: string
  checkinId: string
  visitDay: string // YYYY-MM-DD（日本時間）
  existing: Review | null
  existingPhotoUrl: string | null
  onSaved: (r: Review) => void
  onDeleted: () => void
  onClose: () => void
  save?: typeof saveReview
  remove?: typeof deleteReview
}

type Photo = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; file: File; url: string }

export function ReviewEditor({ shopName, shopId, checkinId, visitDay, existing, existingPhotoUrl, onSaved, onDeleted, onClose, save = saveReview, remove = deleteReview }: Props) {
  const [stars, setStars] = useState(existing?.stars ?? 0)
  const [body, setBody] = useState(existing?.body ?? '')
  const [isPublic, setIsPublic] = useState(existing?.isPublic ?? true)
  const [photo, setPhoto] = useState<Photo>({ kind: 'keep' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const newUrl = photo.kind === 'new' ? photo.url : null
  useEffect(() => () => {
    if (newUrl) URL.revokeObjectURL(newUrl)
  }, [newUrl])

  const check = validateDraft({ stars, body, isPublic })
  const tooLong = !check.ok && check.error === 'too_long'
  const left = REVIEW_BODY_MAX - [...body.trim()].length
  const preview = photo.kind === 'new' ? photo.url : photo.kind === 'keep' && existing?.photoPath ? existingPhotoUrl : null
  const hasPhoto = photo.kind === 'new' || (photo.kind === 'keep' && existing?.photoPath != null)

  async function onSave() {
    if (!check.ok || busy) return
    setBusy(true)
    setError(null)
    const change: PhotoChange = photo.kind === 'new' ? { kind: 'new', file: photo.file } : photo
    try {
      const r = await save({ shopId, checkinId, existing, stars: check.stars, body: check.body, isPublic: check.isPublic, photo: change })
      onSaved(r)
    } catch (e) {
      setError(e instanceof Error && e.message === 'photo_unusable' ? 'この写真は使えませんでした' : '保存できませんでした。もう一度押してください')
    }
    setBusy(false)
  }

  async function onDelete() {
    if (!existing || busy) return
    setBusy(true)
    setError(null)
    try {
      await remove(existing)
      onDeleted()
    } catch {
      setError('消せませんでした。もう一度押してください')
      setBusy(false)
    }
  }

  return (
    <section className="rv-ed" role="dialog" aria-label="感想を書く">
      <header className="rv-ed__bar">
        <button type="button" className="rv-ed__close" aria-label="閉じる" onClick={onClose} disabled={busy}>
          <Icon name="close" size={18} />
        </button>
        <div className="rv-ed__head">
          <b>{shopName}</b>
          <span>{`${visitDay.replaceAll('-', '.')} の訪問`}</span>
        </div>
      </header>

      <div className="rv-ed__box">
        <div className="rv-ed__label">星</div>
        <div className="rv-ed__stars" role="radiogroup" aria-label="星">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={`星 ${n}`}
              className={`rv-ed__star${n <= stars ? ' rv-ed__star--on' : ''}`}
              onClick={() => setStars(n)}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="rv-ed__box">
        <label className="rv-ed__label" htmlFor="rv-ed-body">
          ひとこと
        </label>
        <textarea id="rv-ed-body" className="rv-ed__body" rows={4} value={body} placeholder="どうだった？（なくてもOK）" onChange={(e) => setBody(e.target.value)} />
        {tooLong ? (
          <p className="rv-ed__warn" role="alert">{`${REVIEW_BODY_MAX} 文字までです`}</p>
        ) : (
          <p className="rv-ed__left">{`あと ${left} 文字`}</p>
        )}
      </div>

      <div className="rv-ed__box">
        <div className="rv-ed__label">写真</div>
        {preview && <img className="rv-ed__photo" src={preview} alt="選んだ写真" />}
        <div className="rv-ed__photo-row">
          <label className="rv-ed__pick">
            {hasPhoto ? '写真を替える' : '写真を選ぶ'}
            <input
              type="file"
              accept="image/*"
              aria-label="写真を選ぶ"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) setPhoto({ kind: 'new', file, url: URL.createObjectURL(file) })
              }}
            />
          </label>
          {hasPhoto && (
            <button type="button" className="rv-ed__sub" onClick={() => setPhoto({ kind: 'remove' })}>
              外す
            </button>
          )}
        </div>
      </div>

      <div className="rv-ed__box rv-ed__public">
        <span id="rv-ed-public">みんなに見せる</span>
        <span className="rv-ed__mode">{isPublic ? 'みんなが見られます' : '自分だけ'}</span>
        <button type="button" role="switch" aria-checked={isPublic} aria-labelledby="rv-ed-public" className={`rv-ed__switch${isPublic ? ' rv-ed__switch--on' : ''}`} onClick={() => setIsPublic(!isPublic)}>
          <i />
        </button>
      </div>

      {error && <p className="rv-ed__warn rv-ed__error" role="alert">{error}</p>}

      <button type="button" className="rv-ed__save" disabled={!check.ok || busy} onClick={onSave}>
        {busy ? '保存しています…' : '保存'}
      </button>

      {existing &&
        (confirmDelete ? (
          <div className="rv-ed__confirm">
            <p>この感想を消しますか？写真も消えます。</p>
            <button type="button" className="rv-ed__danger" disabled={busy} onClick={onDelete}>
              消す
            </button>
            <button type="button" className="rv-ed__sub" disabled={busy} onClick={() => setConfirmDelete(false)}>
              やめる
            </button>
          </div>
        ) : (
          <button type="button" className="rv-ed__delete" disabled={busy} onClick={() => setConfirmDelete(true)}>
            この感想を消す
          </button>
        ))}
    </section>
  )
}
