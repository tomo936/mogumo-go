// 図鑑カードの詳細（手帳風）。仕様: docs/superpowers/specs/2026-11-10-zukan-design.md
// 後で入れるもの（感想メモ・住所と営業時間・自分の写真）は、仮の枠だけ置く。口コミ・星は作らない。
import './zukan.css'
import type { ShopKind } from '../../shops/domain/shop.ts'
import { frameTier } from '../../checkin/domain/visits.ts'
import type { ZukanShop } from '../domain/zukan.ts'

const KIND_NAME: Record<ShopKind, string> = {
  ramen: 'ラーメン', sushi: '寿司', soba: 'そば', washoku: '和食', izakaya: '居酒屋', chinese: '中華', yakiniku: '焼肉',
  western: '洋食', curry: 'カレー', cafe: 'カフェ', cake: 'スイーツ', bakery: 'パン', donburi: '丼もの', burger: 'ハンバーガー',
  ethnic: 'エスニック', okonomiyaki: 'お好み焼き', takoyaki: 'たこ焼き', mystery: 'その他',
}
const TIER_NAME = { normal: 'ふつう', silver: '銀', gold: '金' } as const
const cards = import.meta.glob('../../assets/shops/cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const cardUrl = (kind: ShopKind) => cards[`../../assets/shops/cards/${kind}.webp`] ?? cards['../../assets/shops/cards/mystery.webp']

// '2026-11-03' → '2026.11.03'
const dotted = (day: string) => day.replaceAll('-', '.')

type Props = {
  shop: ZukanShop
  onBack: () => void
  onLocate: () => void // 地図でこのお店を見る（名前は仮）
}

export function ZukanDetail({ shop, onBack, onLocate }: Props) {
  const visited = shop.visits !== null
  return (
    <section className="zd" aria-label="図鑑カード詳細">
      <header className="zd__bar">
        <button type="button" className="zd__back" aria-label="戻る" onClick={onBack}>
          ←
        </button>
        <h2>図鑑カード詳細</h2>
      </header>

      <div className="zd__paper">
        <div className="zd__title">{visited ? shop.name : '？？？'}</div>

        <div className={`zd__photo${visited ? '' : ' zd__photo--blur'}`}>
          <span className="zd__tape" aria-hidden="true" />
          <img src={visited && shop.photoUrl ? shop.photoUrl : cardUrl(shop.kind)} alt="" className={visited && shop.photoUrl ? '' : 'zd__model'} />
          {visited && <span className="zd__label">公式の写真</span>}
        </div>

        {visited && (
          <div className="zd__stamp" aria-label={`訪問済み ${dotted(shop.visits!.lastDay)}`}>
            <b>訪問済み</b>
            <span>{dotted(shop.visits!.lastDay)}</span>
          </div>
        )}

        <div className="zd__chips">
          <span className="zd__chip">{KIND_NAME[shop.kind]}</span>
          {shop.budgetName && <span className="zd__chip zd__chip--blue">{shop.budgetName}</span>}
        </div>

        {shop.catch && <p className="zd__catch">{shop.catch}</p>}

        {visited && (
          <div className="zd__record">
            <div><b>{`${shop.visits!.count}回`}</b>行った</div>
            <div><b>{dotted(shop.visits!.firstDay)}</b>はじめて</div>
            <div><b>{dotted(shop.visits!.lastDay)}</b>この前</div>
            <div><b>{TIER_NAME[frameTier(shop.visits!.count)]}</b>の枠</div>
          </div>
        )}

        {/* 後で入れる枠（仮） */}
        <div className="zd__box zd__box--dashed">
          <div className="zd__box-title">感想メモ</div>
          <p>準備中（感想は後の段で入ります）</p>
        </div>

        <div className="zd__box">
          <div className="zd__box-title">店舗情報</div>
          <p>住所・営業時間: 準備中</p>
        </div>

        <div className="zd__box zd__box--dashed">
          <div className="zd__box-title">あなたの写真</div>
          <p>準備中（写真は後の段で入ります）</p>
        </div>

        {visited ? (
          <button type="button" className="zd__locate" onClick={onLocate}>
            地図で見る
          </button>
        ) : (
          <p className="zd__note">まだ行っていません。近くに行くと、ここに名前が出ます</p>
        )}
      </div>
    </section>
  )
}
