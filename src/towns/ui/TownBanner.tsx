// 町をクリア・コンプリートしたときの帯（4秒で消える。タップでも消える）。
// 1つずつ出す: 呼び出し側が key を変えて次の知らせを渡す。
import { useEffect, useRef } from 'react'
import { startConfetti } from '../../checkin/ui/confetti.ts'
import type { TownNews } from '../domain/progress.ts'
import { TownIcon } from './TownIcon.tsx'
import { townCues } from '../../sound/domain/sfx.ts'
import { sound } from '../../sound/infra/sound.ts'
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
    const stopSound = sound.cues(townCues(news?.coins ?? 0)) // 大ファンファーレ（A6）
    return () => {
      clearTimeout(t)
      stopSound()
    }
    // 知らせごとに 1 回（id が同じならコインも同じ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  // 紙ふぶき（チェックインと同じ。2026-11-24 町のクリアの存在感を上げる）。jsdom など canvas が無いときは出さない
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!id || !canvas || !canvas.getContext?.('2d')) return
    return startConfetti(canvas, canvas.clientWidth / 2, canvas.clientHeight * 0.3)
  }, [id])
  if (!news) return null
  const clear = news.kind === 'clear'
  return (
    <>
    <canvas ref={canvasRef} className="town-banner__confetti" aria-hidden="true" />
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
    </>
  )
}
