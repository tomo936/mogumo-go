// ワールドマップの上の「←」と検索欄と候補。手が止まって 0.4 秒後に地理院の住所検索を呼ぶ。
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../ui/Icon.tsx'
import type { Place } from '../domain/gsi.ts'
import { searchPlaces } from '../infra/placeSearch.ts'
import './world.css'

const DELAY_MS = 400
type Result = { status: 'idle' } | { status: 'ok'; places: Place[] } | { status: 'error' }

type Props = {
  onPick: (p: Place) => void
  onBack: () => void
  search?: (q: string, signal: AbortSignal) => Promise<Place[]>
}

const defaultSearch = (q: string, signal: AbortSignal) => searchPlaces(q, fetch, signal)

export function PlaceSearch({ onPick, onBack, search = defaultSearch }: Props) {
  const [q, setQ] = useState('')
  const [result, setResult] = useState<Result>({ status: 'idle' })
  const searchRef = useRef(search)
  searchRef.current = search

  useEffect(() => {
    if (q.trim().length < 2) {
      setResult({ status: 'idle' })
      return
    }
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      searchRef
        .current(q.trim(), ctl.signal)
        .then((places) => {
          if (!ctl.signal.aborted) setResult({ status: 'ok', places })
        })
        .catch(() => {
          if (!ctl.signal.aborted) setResult({ status: 'error' })
        })
    }, DELAY_MS)
    return () => {
      clearTimeout(timer)
      ctl.abort() // 新しい入力で前の要求を止め、古い返事は捨てる
    }
  }, [q])

  return (
    <>
      <div className="wm-top">
        <button type="button" className="wm-back" aria-label="記録へ戻る" onClick={onBack}>
          <Icon name="back" size={22} />
        </button>
        <label className="wm-search on">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></svg>
          <input type="text" value={q} placeholder="地名で探す" aria-label="地名で探す" onChange={(e) => setQ(e.target.value)} />
          {q !== '' && (
            <button type="button" className="x" aria-label="消す" onClick={() => setQ('')}>×</button>
          )}
        </label>
      </div>
      {result.status !== 'idle' && (
        <div className="wm-list">
          {result.status === 'error' && <span className="msg" role="alert">探せませんでした</span>}
          {result.status === 'ok' && result.places.length === 0 && <span className="msg">見つかりませんでした</span>}
          {result.status === 'ok' &&
            result.places.map((p, i) => (
              <button type="button" key={`${p.title}-${i}`} onClick={() => onPick(p)}>
                <span className="ic"><Icon name="pin" size={18} /></span>
                <b>{p.title}</b>
              </button>
            ))}
          {result.status === 'ok' && result.places.length > 0 && <span className="src">地名検索: 国土地理院</span>}
        </div>
      )}
    </>
  )
}
