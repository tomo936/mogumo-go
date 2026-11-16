import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import '@fontsource/m-plus-rounded-1c/800.css'
import './credits.css'
import { loading } from './loadingGate.ts'
import titleArt from '../assets/ui/title.webp'
import pancakeArt from '../assets/ui/loading-pancake.webp'
import logoArt from '../assets/ui/logo.webp'
import cloudA from '../assets/fog/cloud-01-wide-flat.png'
import cloudB from '../assets/fog/cloud-03-low-triple.png'
import cloudC from '../assets/fog/cloud-07-mountain.png'

const INTRO_FALLBACK_MS = 2500 // 動きが止められている端末で animationend が来なくても、演出の雲は消す

// タイトルを閉じたあとの「空から来た」演出（2026-11-16 オーナー）: 画面いっぱいの雲（霧と同じ雲の絵）が左右に開いて消える。
// カメラが空から降りるのは地図の側（loading.onEnter → MapView の intro）
function SkyIntro({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current!
    const end = (e: Event) => e.target === el && onDone()
    el.addEventListener('animationend', end)
    const id = setTimeout(onDone, INTRO_FALLBACK_MS)
    return () => {
      el.removeEventListener('animationend', end)
      clearTimeout(id)
    }
  }, [onDone])
  const side = (cls: string) => (
    <div className={`sky-intro__side ${cls}`}>
      {[cloudA, cloudC, cloudB, cloudA, cloudC, cloudB, cloudA].map((src, i) => (
        <img key={i} src={src} alt="" className={`sky-intro__cloud sky-intro__cloud--${i}`} />
      ))}
    </div>
  )
  return (
    <div ref={ref} className="sky-intro" data-testid="sky-intro" aria-hidden="true">
      {side('sky-intro__side--l')}
      {side('sky-intro__side--r')}
    </div>
  )
}

const MAX_WAIT_MS = 8000 // お店がそろわなくても、起動からここでメインへ

// 起動時のタイトル画面（2026-11-16 オーナー: 絵 art/ui/title.png、上にロゴ、「タップしてスタート」を丸い字でチカチカ。OP はなし）。
// 押すと、地図がお店を読んでいる間は右下にパンケーキ（ミシェーラのローディング）と「読み込み中」、そろったら（起動から最大 8 秒）メインへ。
// 地図の出典はここで示す（OSMF Attribution Guidelines：起動時のスプラッシュで可）。あとから見られる場所は設定の「出典・クレジット」。
// 町の境目は e-Stat の利用規約どおり、出典と「加工して作成」を書く（国が作ったように見せない）
export function Splash() {
  const [tapped, setTapped] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)
  const waiting = useSyncExternalStore(loading.subscribe, loading.waiting) && !gaveUp
  useEffect(() => {
    const id = setTimeout(() => setGaveUp(true), MAX_WAIT_MS)
    return () => clearTimeout(id)
  }, [])
  const entering = tapped && !waiting
  // 地図へ入った: カメラが空から降りる合図を 1 回だけ出す
  useEffect(() => {
    if (entering) loading.enter()
  }, [entering])
  if (entering) return introDone ? null : <SkyIntro onDone={() => setIntroDone(true)} />
  return (
    <button
      type="button"
      className="splash"
      style={{ '--splash-art': `url(${titleArt})` } as React.CSSProperties}
      onClick={() => setTapped(true)}
    >
      {/* ロゴ（オーナー 2026-11-16。art/branding/logo.png → src/assets/ui/logo.webp 幅 720px） */}
      <img className="splash-logo" src={logoArt} alt="もぐもGO" />
      {tapped ? (
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
