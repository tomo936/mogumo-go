// 図鑑カードの詳細（案B。2026-11-12 オーナー決定）。大きなカード・数字 3 つ・わたしの感想・みんなの感想・地図で見る。
// 仕様: docs/superpowers/specs/2026-11-12-zukan-b-reviews-design.md の 2.（「お店の情報」は出さない）。
// 共有は 2026-11-12 には出さないと決めたが、2026-11-23 B-19「共有」で足す（行ったお店だけ。置き場所はボード B-21 で確認中）
import './zukan.css'
import { frameTier } from '../../checkin/domain/visits.ts'
import type { ZukanShop } from '../domain/zukan.ts'
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'
import { MyReviews } from '../../reviews/ui/MyReviews.tsx'
import { ReviewList } from '../../reviews/ui/ReviewList.tsx'
import { cardUrl, kindIcon } from './cardArt.ts'
import { Icon } from '../../ui/Icon.tsx'
import { useEffect, useState } from 'react'
import { zukanShareText } from '../../share/domain/shareText.ts'
import { shareOut, shareImage } from '../../share/infra/share.ts'
import { drawShareCard } from '../../share/infra/shareCard.ts'
import { loadMine, photoUrls } from '../../reviews/infra/reviewsApi.ts'

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
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false) // 共有の画面が出ている間は、もう一度押せない（iPhone は 2 回目が失敗になる）
  // 共有の画像（2026-11-24 B-21「感想の文と画像つきで、このアプリ独自の見た目の画像で」）。
  // iPhone は押した直後でないと共有の画面を出せないので、詳細を開いたときに先に作っておく。作れなければ文だけで共有する
  const [card, setCard] = useState<Blob | 'none' | null>(null)
  useEffect(() => {
    if (!v) return
    let alive = true
    void (async () => {
      try {
        const { mine } = await loadMine(shop.id).catch(() => ({ mine: [] as Awaited<ReturnType<typeof loadMine>>['mine'] }))
        const latest = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
        const own = latest?.photoPath ? (await photoUrls([latest.photoPath]).catch(() => new Map<string, string>())).get(latest.photoPath) ?? null : null
        const blob = await drawShareCard(
          { shopName: shop.name, kindLabel: KIND_LABEL[shop.kind] ?? null, visits: v.count, stars: latest?.stars ?? null, comment: latest?.body ?? null, photo: own ? 'own' : 'kind' },
          own ?? cardUrl(shop.kind), // 写真が無ければ図鑑のカードの絵（お店の建物）
        )
        if (alive) setCard(blob)
      } catch {
        if (alive) setCard('none')
      }
    })()
    return () => {
      alive = false
    }
  }, [shop.id, shop.name, shop.kind, v])
  const share = async () => {
    if (sharing) return
    setSharing(true)
    setShareMsg(null)
    const text = zukanShareText({ shopName: shop.name, kindLabel: KIND_LABEL[shop.kind] ?? null, visits: v?.count ?? 1 })
    const r = card instanceof Blob ? await shareImage(card, text) : await shareOut(text)
    setShareMsg(r === 'copied' ? '文をコピーしました' : r === 'saved' ? '画像を保存しました' : r === 'failed' ? '共有できませんでした' : null)
    setSharing(false)
  }
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
          <button type="button" className="zd__share" disabled={sharing || card === null} onClick={() => void share()}>
            {card === null ? '共有の画像を作っています…' : '共有する'}
          </button>
          {shareMsg && (
            <p className="zd__share-msg" role="status">
              {shareMsg}
            </p>
          )}
        </>
      )}
    </section>
  )
}
