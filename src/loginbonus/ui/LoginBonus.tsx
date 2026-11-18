// ログインボーナスの受け取り画面（A4）。ミシェーラのパネル（スタンプの丸 7 つ）に、今日のスタンプが押される。
// 設計: docs/superpowers/specs/2026-11-17-login-bonus-design.md
import { useEffect } from 'react'
import './loginBonus.css'
import panelArt from '../../assets/ui/login-bonus-panel.webp'
import { CoinIcon } from '../../ui/CoinIcon.tsx'
import { sound } from '../../sound/infra/sound.ts'
import { STAMP_COINS } from '../domain/loginBonus.ts'
import type { Claim } from '../domain/loginBonus.ts'

// パネルの絵（1179×786）の丸の中心（絵の幅・高さに対する %。上の段 4 つ・下の段 3 つ）
const SPOTS: [number, number][] = [
  [22.7, 42], [40.8, 42], [59.1, 42], [77.3, 42],
  [31.6, 66.8], [50, 66.8], [68.5, 66.8],
]

export function LoginBonus({ claim, onClose }: { claim: Claim; onClose: () => void }) {
  // スタンプが押されるころにコインの音（A6）
  useEffect(() => sound.cues([{ name: 'coin', atMs: 650 }]), [])
  const lap = claim.stampNo === 7
  return (
    <div className="lb" role="dialog" aria-label="ログインボーナス" onClick={onClose}>
      <div className="lb__card" onClick={(e) => e.stopPropagation()}>
        {/* 上に、大きなコインと枚数をバンと出す（2026-11-17 オーナー「上にコインをバンっと」） */}
        <p className="lb__msg" role="status">
          <span className="lb__day">{`${claim.stampNo}日目`}</span>
          <span className="lb__coins">
            <CoinIcon size={64} />
            <b>{`+${claim.coins}`}</b>
          </span>
          {lap && <small>7 個そろった！ 1 周です。次はまた 1 日目から</small>}
        </p>
        <div className="lb__panel" style={{ backgroundImage: `url(${panelArt})` }}>
          {SPOTS.map(([x, y], i) => {
            const state = i + 1 < claim.stampNo ? 'done' : i + 1 === claim.stampNo ? 'today' : 'todo'
            return (
              <div key={i} className={`lb__stamp lb__stamp--${state}`} data-testid="stamp" data-state={state} style={{ left: `${x}%`, top: `${y}%` }}>
                {state === 'todo' ? null : <CoinIcon size={46} />}
                <b>{`+${STAMP_COINS[i]}`}</b>
              </div>
            )
          })}
        </div>
        <button type="button" className="lb__close" onClick={onClose}>とじる</button>
      </div>
    </div>
  )
}
