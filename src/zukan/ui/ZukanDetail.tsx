// 図鑑カードの詳細（案B。2026-11-12 オーナー決定）。大きなカード・数字 3 つ・わたしの感想・みんなの感想・地図で見る。
// 仕様: docs/superpowers/specs/2026-11-12-zukan-b-reviews-design.md の 2.（共有ボタンと「お店の情報」は出さない）
import './zukan.css'
import { frameTier } from '../../checkin/domain/visits.ts'
import type { ZukanShop } from '../domain/zukan.ts'
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'
import { MyReviews } from '../../reviews/ui/MyReviews.tsx'
import { ReviewList } from '../../reviews/ui/ReviewList.tsx'
import { cardUrl, kindIcon } from './cardArt.ts'
import { Icon } from '../../ui/Icon.tsx'

// 段の呼び名は 銅（1〜2 回）・銀（3〜9 回）・金（10 回〜）。2026-11-12 オーナー「金銀銅」
const TIER_CHIP = { normal: '銅の枠', silver: '銀の枠', gold: '金の枠' } as const

// '2026-11-03' → '2026.11.03'、'11.03'
const dotted = (day: string) => day.replaceAll('-', '.')
const short = (day: string) => day.slice(5).replace('-', '.')

type Props = {
  shop: ZukanShop
  no?: string
  onBack: () => void
  onLocate: () => void
}

export function ZukanDetail({ shop, no, onBack, onLocate }: Props) {
  const v = shop.visits
  const tier = v ? frameTier(v.count) : 'normal'
  return (
    <section className="zd" aria-label="図鑑カード詳細">
      <header className="zd__bar">
        <button type="button" className="zd__back" aria-label="戻る" onClick={onBack}>
          <Icon name="back" size={20} />
        </button>
        {no && <span>{no}</span>}
      </header>

      <div className={`zd__hero zd__hero--${tier}`}>
        <div className="zd__art">
          {shop.photoUrl ? <img src={shop.photoUrl} alt="" /> : <img src={cardUrl(shop.kind)} alt="" className="zd__model" />}
          {shop.photoUrl && <span className="zd__label">公式の写真</span>}
        </div>
        <h2 className="zd__name">{v ? shop.name : '？？？'}</h2>
        <div className="zd__chips">
          <span className="zd__chip">
            <img src={kindIcon(shop.kind)} alt="" />
            {KIND_LABEL[shop.kind]}
          </span>
          {shop.budgetName && <span className="zd__chip">{shop.budgetName}</span>}
          <span className="zd__chip zd__chip--tier">{TIER_CHIP[tier]}</span>
        </div>
        {shop.catch && <p className="zd__catch">{shop.catch}</p>}
        {v && (
          <div className="zd__stamp" aria-label={`訪問済み ${dotted(v.lastDay)}`}>
            <b>訪問済み</b>
            <span>{dotted(v.lastDay)}</span>
          </div>
        )}
      </div>

      {v && (
        <>
          <div className="zd__stats">
            <div>
              <b>
                {v.count}
                <small>回</small>
              </b>
              行った
            </div>
            <div title={dotted(v.firstDay)}>
              <b>{short(v.firstDay)}</b>
              はじめて
            </div>
            <div title={dotted(v.lastDay)}>
              <b>{short(v.lastDay)}</b>
              この前
            </div>
          </div>
          <MyReviews shopId={shop.id} shopName={shop.name} />
          <ReviewList shopId={shop.id} />
          <button type="button" className="zd__locate" onClick={onLocate}>
            地図で見る
          </button>
        </>
      )}
    </section>
  )
}
