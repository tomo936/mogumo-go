import { useEffect, useState } from 'react'
import './credits.css'

// 起動時のスプラッシュ。地図の出典はここで示す（OSMF Attribution Guidelines：起動時のスプラッシュで可）。
// 3秒で消え、タップでも消せる。あとから見られる場所は CreditsButton
export function Splash() {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setOpen(false), 3000)
    return () => clearTimeout(id)
  }, [])
  if (!open) return null
  return (
    <button type="button" className="splash" onClick={() => setOpen(false)}>
      <span className="splash-title">もぐもGO</span>
      <span className="splash-credit">
        <span>地図: OpenFreeMap © OpenMapTiles</span>
        <span>データ: © OpenStreetMap contributors</span>
        <span>Powered by ホットペッパーグルメ Webサービス</span>
      </span>
    </button>
  )
}
