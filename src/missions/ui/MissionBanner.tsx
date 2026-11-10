// 週ミッションを達成したときの帯（町の帯と同じ形・4秒で消える。タップでも消える）
import { useEffect, useRef } from 'react'
import { CoinIcon } from '../../ui/CoinIcon.tsx'
import { DIFFICULTY_LABEL, missionTitle } from '../domain/mission.ts'
import type { Mission } from '../domain/mission.ts'
import '../../towns/ui/towns.css'
import './missions.css'

export const MISSION_BANNER_MS = 4000

export function MissionBanner({ mission, onDone }: { mission: Mission; onDone: () => void }) {
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })
  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), MISSION_BANNER_MS)
    return () => clearTimeout(t)
  }, [mission.id])
  return (
    <div className="town-banner mission-banner" role="status" onClick={onDone}>
      <span className="town-banner__body">
        <span className="town-banner__title">ミッション達成！</span>
        <span className="town-banner__sub">{`${DIFFICULTY_LABEL[mission.difficulty]}・${missionTitle(mission)}`}</span>
      </span>
      <span className="town-banner__coin"><CoinIcon size={18} />{`+${mission.reward}`}</span>
    </div>
  )
}
