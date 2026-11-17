// キャラ一覧（A15。地図の左上のキャラを押すと開く）。図鑑とは違う形: 上半分に選んでいるキャラを大きく、下半分に全身の原画の一覧。
// 設計 docs/superpowers/specs/2026-11-17-gacha-design.md の 5。3D を回して見るのは 3D が届いてから
import { useState } from 'react'
import './charList.css'
import { CHARACTERS } from '../domain/characters.ts'
import type { Rarity } from '../domain/characters.ts'
import { FRIENDSHIP_MAX, friendshipHearts } from '../domain/gacha.ts'
import { standArtUrl } from '../infra/gachaApi.ts'
import { Icon } from '../../ui/Icon.tsx'
import { Stars } from './GachaScreen.tsx'
import { AvatarViewer } from './AvatarViewer.tsx'

type Props = {
  owned: ReadonlyMap<number, number> // 持っているガチャのキャラ → ダブった数
  currentId: number
  onPick: (id: number) => Promise<boolean>
  onClose: () => void
}
type Filter = 'all' | Rarity

const isStarter = (id: number) => id === 101 || id === 102

export function CharacterList({ owned, currentId, onPick, onClose }: Props) {
  const [using, setUsing] = useState(currentId)
  const [sel, setSel] = useState(currentId)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const has = (id: number) => isStarter(id) || owned.has(id)
  const c = CHARACTERS.find((x) => x.id === sel) ?? CHARACTERS[0]
  const hearts = isStarter(c.id) ? null : friendshipHearts(owned.get(c.id) ?? 0)
  const shown = CHARACTERS.filter((x) => filter === 'all' || x.rarity === filter)
  const count = CHARACTERS.filter((x) => has(x.id)).length

  const pick = async () => {
    setBusy(true)
    setFailed(false)
    const ok = await onPick(sel)
    setBusy(false)
    if (ok) setUsing(sel)
    else setFailed(true)
  }

  return (
    <section className="cl" aria-label="キャラ">
      <header className="cl__bar">
        <button type="button" className="cl__back" aria-label="戻る" onClick={onClose}>
          <Icon name="back" size={20} />
        </button>
        <h1>キャラ</h1>
        <span className="cl__count">{`${count} / ${CHARACTERS.length}`}</span>
      </header>

      <section className={hearts === FRIENDSHIP_MAX ? 'cl__big is-max' : 'cl__big'} aria-label="選んでいるキャラ">
        <div className="cl__stage" key={c.id}>
          {/* 3D があるキャラは 3D（回して見られる）、無ければ原画 */}
          <AvatarViewer id={c.id} fallback={<img src={standArtUrl(c.id)} alt="" />} />
        </div>
        <div className="cl__info">
          {c.rarity ? <Stars n={c.rarity} /> : <span className="cl__first">はじめのなかま</span>}
          <b className="cl__name">{c.name}</b>
          {hearts !== null && (
            <span className="cl__hearts" aria-label={`なかよし度 ${hearts}`}>
              {'♥'.repeat(hearts)}
              <span className="cl__hearts-off">{'♥'.repeat(FRIENDSHIP_MAX - hearts)}</span>
            </span>
          )}
          {failed && (
            <p className="cl__error" role="alert">
              変えられませんでした。もう一度お試しください
            </p>
          )}
          <button type="button" className="cl__use" disabled={busy || sel === using} onClick={() => void pick()}>
            {sel === using ? '使っています' : busy ? '少し待ってね…' : 'このキャラにする'}
          </button>
        </div>
      </section>

      <div className="cl__tabs" role="tablist">
        {(['all', 5, 4, 3] as Filter[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'is-on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? '全部' : `★${f}`}
          </button>
        ))}
      </div>

      <ul className="cl__list">
        {shown.map((x) => {
          const mine = has(x.id)
          const max = !isStarter(x.id) && friendshipHearts(owned.get(x.id) ?? 0) === FRIENDSHIP_MAX
          return (
            <li key={x.id}>
              <button
                type="button"
                className={['cl__cell', sel === x.id && 'is-sel', !mine && 'is-locked', max && 'is-max'].filter(Boolean).join(' ')}
                disabled={!mine}
                aria-label={mine ? x.name : `${x.name}（まだ出会っていない）`}
                aria-pressed={sel === x.id}
                onClick={() => {
                  setSel(x.id)
                  setFailed(false)
                }}
              >
                <img src={standArtUrl(x.id)} alt="" />
                {x.id === using && <span className="cl__using">使用中</span>}
                {x.rarity && <span className={`cl__r cl__r--${x.rarity}`}>{`★${x.rarity}`}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
