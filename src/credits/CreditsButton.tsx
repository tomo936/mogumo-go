import { useState } from 'react'
import './credits.css'

// 地図データの出典の詳しい情報。マイページができたらそちらへ移す
export function CreditsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="credits-button" onClick={() => setOpen(true)}>出典</button>
      {open && (
        <div className="credits-panel" role="dialog" aria-label="地図データの出典">
          <h2>地図データの出典</h2>
          <p>
            地図: <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a>{' '}
            © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a>
          </p>
          <p>
            データ: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
          </p>
          <p>
            お店の情報: <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer">Powered by ホットペッパーグルメ Webサービス</a>
          </p>
          <button type="button" onClick={() => setOpen(false)}>閉じる</button>
        </div>
      )}
    </>
  )
}
