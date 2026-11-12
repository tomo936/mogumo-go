import { useEffect, useState } from 'react'
import './credits.css'

// 起動時のスプラッシュ。地図の出典はここで示す（OSMF Attribution Guidelines：起動時のスプラッシュで可）。
// 3秒で消え、タップでも消せる。あとから見られる場所は設定の「出典・クレジット」。
// 町の境目は e-Stat の利用規約どおり、出典と「加工して作成」を書く（国が作ったように見せない）
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
        <span>町の境目: 「国勢調査 町丁・字等別境界データ」（総務省統計局・e-Stat）を加工して作成</span>
        <span>地名検索: 国土地理院</span>
      </span>
    </button>
  )
}
