import { useEffect, useState, useSyncExternalStore } from 'react'
import '@fontsource/m-plus-rounded-1c/800.css'
import './credits.css'
import { loading } from './loadingGate.ts'
import titleArt from '../assets/ui/title.webp'
import pancakeArt from '../assets/ui/loading-pancake.webp'

const MAX_WAIT_MS = 8000 // お店がそろわなくても、ここで「タップしてスタート」を出す

// 起動時のタイトル画面（2026-11-16 オーナー: 絵 art/ui/title.png、上にロゴ、「タップしてスタート」を丸い字でチカチカ）。
// 地図がお店を読んでいる間は右下にパンケーキ（ミシェーラのローディング）と「読み込み中」、そろったら（最大 8 秒）「タップしてスタート」。
// 地図の出典はここで示す（OSMF Attribution Guidelines：起動時のスプラッシュで可）。あとから見られる場所は設定の「出典・クレジット」。
// 町の境目は e-Stat の利用規約どおり、出典と「加工して作成」を書く（国が作ったように見せない）
export function Splash() {
  const [open, setOpen] = useState(true)
  const [gaveUp, setGaveUp] = useState(false)
  const waiting = useSyncExternalStore(loading.subscribe, loading.waiting) && !gaveUp
  useEffect(() => {
    const id = setTimeout(() => setGaveUp(true), MAX_WAIT_MS)
    return () => clearTimeout(id)
  }, [])
  if (!open) return null
  return (
    <button
      type="button"
      className="splash"
      style={{ '--splash-art': `url(${titleArt})` } as React.CSSProperties}
      onClick={() => !waiting && setOpen(false)}
    >
      {/* ロゴ（ミシェーラの固定版ロゴのファイルが届いたら差し替える） */}
      <span className="splash-title">もぐもGO</span>
      {waiting ? (
        <span className="splash-loading" role="status">
          <img src={pancakeArt} alt="" />
          <span>
            読み込み中<span className="splash-dots" aria-hidden="true" />
          </span>
        </span>
      ) : (
        <span className="splash-start">タップしてスタート</span>
      )}
      <span className="splash-credit">
        <span>地図: OpenFreeMap © OpenMapTiles</span>
        <span>データ: © OpenStreetMap contributors</span>
        <span>Powered by ホットペッパーグルメ Webサービス</span>
        <span>町の境目: 「国勢調査 町丁・字等別境界データ」（総務省統計局・e-Stat）を加工して作成</span>
        <span>地名検索: 国土地理院</span>
        <span>図鑑の字体: M PLUS Rounded 1c（SIL Open Font License 1.1）</span>
        <span>チェーン店の判定: name-suggestion-index（OpenStreetMap, BSD-3-Clause）</span>
      </span>
    </button>
  )
}
