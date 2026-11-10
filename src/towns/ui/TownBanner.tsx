// 町をクリア・コンプリートしたときの帯（4秒で消える。タップでも消える）。
// 1つずつ出す: 呼び出し側が key を変えて次の知らせを渡す。
import { useEffect, useRef } from 'react'
import type { TownNews } from '../domain/progress.ts'
import { TownIcon } from './TownIcon.tsx'
import './towns.css'

export const TOWN_BANNER_MS = 4000

type Props = { news: TownNews | null; onDone: () => void }

export function TownBanner({ news, onDone }: Props) {
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })
  const id = news ? `${news.id}:${news.kind}` : null
  useEffect(() => {
    if (!id) return
    const t = setTimeout(() => doneRef.current(), TOWN_BANNER_MS)
    return () => clearTimeout(t)
  }, [id])
  if (!news) return null
  const clear = news.kind === 'clear'
  return (
    <div className={`town-banner town-banner--${news.kind}`} role="status" onClick={onDone}>
      <span className="town-banner__icon"><TownIcon kind={news.kind} size={46} /></span>
      <span className="town-banner__body">
        <span className="town-banner__title">{`${news.name} ${clear ? 'クリア！' : 'コンプリート！'}`}</span>
        <span className="town-banner__sub">{clear ? '町の霧がぜんぶ晴れた' : '町のお店をぜんぶ回った'}</span>
      </span>
      {news.coins > 0 && (
        <span className="town-banner__coin">
          <span className="town-banner__coin-icon" aria-hidden="true" />
          {`+${news.coins}`}
        </span>
      )}
    </div>
  )
}
