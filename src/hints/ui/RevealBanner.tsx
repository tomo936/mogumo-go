// 30m に入って店名が明かされたときの帯（約3秒で閉じる。タップでも閉じる）。
import { useEffect, useRef } from 'react'
import { REVEAL_BANNER_MS } from '../config.ts'
import './hints.css'

type Props = { name: string; onDone: () => void }

export function RevealBanner({ name, onDone }: Props) {
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })
  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), REVEAL_BANNER_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="reveal-banner" role="status" onClick={onDone}>
      {`気配の正体は…『${name}』！`}
    </div>
  )
}
