// 実績の一覧（記録の「じっせき」タブ）。グループごとに見出しと「取れた数 / 全部」、メダルの格子。
// 段のある実績（はじめてのラーメン → ラーメンマスター など）は1つにまとめ、今の段を見せる。
// 押すと下から小さいシートで、名前・条件・取った日か「あと N」と、段の並び。ひみつは取るまで条件も「？？？」。
import { useState } from 'react'
import './badges.css'
import { remaining, seriesOf, type BadgeSeries } from '../domain/evaluate.ts'
import { GROUP_LABEL, GROUP_ORDER, type BadgeState } from '../domain/types.ts'
import { BadgeMedal } from './BadgeMedal.tsx'

const dateLabel = (ms: number) => {
  const d = new Date(ms + 9 * 3600_000) // 日本時間
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
}

export function BadgeList({ states, hasHome }: { states: BadgeState[]; hasHome: boolean }) {
  const [open, setOpen] = useState<BadgeSeries | null>(null)
  const series = seriesOf(states)
  const earned = states.filter((s) => s.earnedAt !== null).length
  return (
    <div className="bd">
      <p className="bd__total">{`とった実績 ${earned} / ${states.length}`}</p>
      {GROUP_ORDER.map((g) => {
        const list = states.filter((s) => s.def.group === g)
        if (list.length === 0) return null
        const items = series.filter((x) => x.face.def.group === g)
        return (
          <section key={g} className="bd__group" aria-label={GROUP_LABEL[g]}>
            <h3 className="bd__head">
              <span>{GROUP_LABEL[g]}</span>
              <small>{`${list.filter((s) => s.earnedAt !== null).length} / ${list.length}`}</small>
            </h3>
            <div className="bd__grid">
              {items.map((x) => (
                <button key={x.face.def.series} type="button" className="bd__item" onClick={() => setOpen(x)}>
                  <BadgeMedal state={x.face} size={80} />
                </button>
              ))}
            </div>
          </section>
        )
      })}

      {open && <BadgeDetail series={open} hasHome={hasHome} onClose={() => setOpen(null)} />}
    </div>
  )
}

function BadgeDetail({ series, hasHome, onClose }: { series: BadgeSeries; hasHome: boolean; onClose: () => void }) {
  const state = series.face
  const { def } = state
  const hidden = def.secret && state.earnedAt === null
  const target = series.next // 次にねらう段（全部取れていれば null）
  const left = target ? remaining(target) : null
  return (
    <div className="bd-sheet" role="dialog" aria-label="実績のくわしく">
      <button type="button" className="bd-sheet__backdrop" aria-label="閉じる" onClick={onClose} />
      <div className="bd-sheet__card">
        <BadgeMedal state={state} size={150} />
        <h4>{hidden ? '？？？' : def.name}</h4>
        <p className="bd-sheet__how">{hidden ? 'ひみつの実績。条件は取るまでのお楽しみ' : def.how}</p>
        {state.earnedAt !== null && <p className="bd-sheet__got">{`${dateLabel(state.earnedAt)} にとった`}</p>}
        {target && def.needsHome && !hasHome ? (
          <p className="bd-sheet__left">自宅を設定すると数えます</p>
        ) : (
          !hidden && target && left && <p className="bd-sheet__left">{target === state ? left : `つぎは「${target.def.name}」 ${left}`}</p>
        )}
        {series.steps.length > 1 && (
          <div className="bd-sheet__steps" aria-label="段">
            {series.steps.map((s) => (
              <div key={s.def.id} className={s === state ? 'is-face' : ''}>
                <BadgeMedal state={s} size={52} />
                <small>{s.def.need !== null ? `${s.def.need}${s.def.unit}` : ''}</small>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="bd-sheet__close" onClick={onClose}>とじる</button>
      </div>
    </div>
  )
}
