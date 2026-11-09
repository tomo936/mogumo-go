// 地図の下の真ん中の大きな丸ボタン「探索」。まだの気配の数を小さな丸で出す。
import './hints.css'

type Props = { remaining: number | null; onClick: () => void }

export function ExploreButton({ remaining, onClick }: Props) {
  return (
    <button type="button" className="explore-button" onClick={onClick}>
      <span className="explore-button__label">探索</span>
      {remaining !== null && remaining > 0 && <span className="explore-button__count">{remaining}</span>}
    </button>
  )
}
