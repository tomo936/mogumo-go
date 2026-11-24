// 食べ歩きプロフィール（2026-11-24 「すぐ」の 5）。記録の「じっせき」の上に出す
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'
import { kindIcon } from '../../zukan/ui/cardArt.ts'
import type { EatStats } from '../domain/eatStats.ts'

export function EatStatsCard({ stats, towns }: { stats: EatStats; towns: number | null }) {
  const max = Math.max(1, ...stats.months.map((m) => m.visits))
  return (
    <section className="es" aria-label="食べ歩きプロフィール">
      <h3 className="es__title">食べ歩きプロフィール</h3>
      <div className="es__nums">
        <div><b>{stats.shops}</b><span>行ったお店</span></div>
        <div><b>{stats.visits}</b><span>行った回数</span></div>
        <div><b>{towns ?? '—'}</b><span>行った町</span></div>
        <div><b>{stats.kinds}</b><span>行った種類</span></div>
      </div>
      {stats.topKind && (
        <p className="es__top">
          <img src={kindIcon(stats.topKind.kind)} alt="" />
          いちばん行った種類は <b>{KIND_LABEL[stats.topKind.kind]}</b>（{stats.topKind.shops} 軒）
        </p>
      )}
      <div className="es__months" role="img" aria-label={`月ごとの回数 ${stats.months.map((m) => `${Number(m.month.slice(5))}月 ${m.visits}回`).join('、')}`}>
        {stats.months.map((m) => (
          <div key={m.month} className="es__month">
            <span className="es__count">{m.visits}</span>
            <i style={{ height: `${Math.round((m.visits / max) * 56)}px` }} />
            <span className="es__label">{`${Number(m.month.slice(5))}月`}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
