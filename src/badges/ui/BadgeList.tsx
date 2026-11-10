// 実績の一覧（記録の「じっせき」タブ）。グループごとに見出しと「取れた数 / 全部」、メダルの格子。
// 段のある実績（はじめてのラーメン → ラーメンマスター など）は1行に全部の段を並べる（まだの段は灰色）。
// 1つだけの実績は格子に並べる。押すと下から小さいシートで、名前・条件・取った日か「あと N」と、段の並び。
// ひみつは取るまで条件も「？？？」。
import { useState } from 'react'
import './badges.css'
import { remaining, seriesOf, type BadgeSeries } from '../domain/evaluate.ts'
import { GROUP_LABEL, GROUP_ORDER, type BadgeState } from '../domain/types.ts'
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'
import { BadgeMedal } from './BadgeMedal.tsx'

const dateLabel = (ms: number) => {
  const d = new Date(ms + 9 * 3600_000) // 日本時間
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
}

// 取った日（日本時間）を短く: 11/3。年がちがえば 2025/11/3
const shortDate = (ms: number) => {
  const d = new Date(ms + 9 * 3600_000)
  const nowYear = new Date(Date.now() + 9 * 3600_000).getUTCFullYear()
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
  return d.getUTCFullYear() === nowYear ? md : `${d.getUTCFullYear()}/${md}`
}

export function BadgeList({ states, hasHome }: { states: BadgeState[]; hasHome: boolean }) {
  const [open, setOpen] = useState<{ series: BadgeSeries; state: BadgeState } | null>(null)
  const [pressed, setPressed] = useState<string | null>(null) // 指が触れている間だけ取った日を出す
  const touch = (id: string) => ({
    onPointerDown: () => setPressed(id),
    onPointerUp: () => setPressed(null),
    onPointerLeave: () => setPressed(null),
    onPointerCancel: () => setPressed(null),
  })
  const dateBubble = (st: BadgeState) =>
    pressed === st.def.id && st.earnedAt !== null ? <span className="bd__date" role="tooltip">{shortDate(st.earnedAt)}</span> : null
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
            {items.filter((x) => x.steps.length > 1).map((x) => (
              <div key={x.face.def.series} className="bd__row">
                <div className="bd__rowhead">
                  <span>{rowLabel(x)}</span>
                  <small>{`${x.steps.filter((s) => s.earnedAt !== null).length} / ${x.steps.length}`}</small>
                </div>
                <div className="bd__steps">
                  {x.steps.map((s) => (
                    <button key={s.def.id} type="button" className="bd__item" {...touch(s.def.id)} onClick={() => setOpen({ series: x, state: s })}>
                      <BadgeMedal state={s} size={64} />
                      {dateBubble(s)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {items.some((x) => x.steps.length === 1) && (
              <div className="bd__grid">
                {items.filter((x) => x.steps.length === 1).map((x) => (
                  <button key={x.face.def.series} type="button" className="bd__item" {...touch(x.face.def.id)} onClick={() => setOpen({ series: x, state: x.face })}>
                    <BadgeMedal state={x.face} size={80} />
                    {dateBubble(x.face)}
                  </button>
                ))}
              </div>
            )}
          </section>
        )
      })}

      {open && <BadgeDetail series={open.series} state={open.state} hasHome={hasHome} onClose={() => setOpen(null)} />}
    </div>
  )
}

// 行の名前（ジャンルは種類の名前、それ以外は最初の段の名前）
const rowLabel = (x: BadgeSeries) => {
  const art = x.steps[0].def.art
  if ('kind' in art) return art.kind === 'mystery' ? 'なぞ' : KIND_LABEL[art.kind]
  return x.steps[0].def.how.replace(/\s*\d[\d.]*\s*(回|軒|日|km²|km)/, ' ◯$1')
}

function BadgeDetail({ series, state, hasHome, onClose }: { series: BadgeSeries; state: BadgeState; hasHome: boolean; onClose: () => void }) {
  const { def } = state
  const hidden = def.secret && state.earnedAt === null
  // ねらう段: 押した段がまだならその段、取れていれば次のまだの段
  const target = state.earnedAt === null ? state : series.next
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
                <small className="bd-sheet__stepdate">{s.earnedAt !== null ? shortDate(s.earnedAt) : '—'}</small>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="bd-sheet__close" onClick={onClose}>とじる</button>
      </div>
    </div>
  )
}
