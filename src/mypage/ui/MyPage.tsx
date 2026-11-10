// マイページ（全画面）。キャラ・ニックネーム（変更可）・Lv、数字のカード、最近とった実績、自宅の場所の変更。
// 仕様: docs/superpowers/specs/2026-11-10-record-pins-badges-mypage-settings-design.md §3、SPEC S15（ニックネームは後から変更可・自宅の変更はマイページから）
import { useEffect, useMemo, useState } from 'react'
import './mypage.css'
import { Icon } from '../../ui/Icon.tsx'
import { checkNickname, NICKNAME_MAX } from '../../setup/domain/nickname.ts'
import { profileRepo, type StarterId } from '../../setup/infra/profileRepo.ts'
import { levelFor, needFor } from '../../zukan/domain/level.ts'
import { loadRecord } from '../../record/infra/recordApi.ts'
import type { ClearedCell, VisitEntry } from '../../record/domain/timeline.ts'
import { areaKm2At, areaTimeline } from '../../towns/domain/area.ts'
import type { ClearedTown } from '../../towns/domain/shape.ts'
import { evaluate, recentEarned } from '../../badges/domain/evaluate.ts'
import { BadgeMedal } from '../../badges/ui/BadgeMedal.tsx'
import type { LatLng } from '../../map/domain/geo.ts'
import { loadCoins } from '../infra/coins.ts'
import { ChangeHome } from './ChangeHome.tsx'

const CHARACTERS = import.meta.glob<string>('../../assets/characters/starter-*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const characterUrl = (id: StarterId) => CHARACTERS[id === 102 ? '../../assets/characters/starter-girl.webp' : '../../assets/characters/starter-boy.webp']

type Data = { cells: ClearedCell[]; visits: VisitEntry[]; towns: ClearedTown[]; coins: number | null }
type Props = {
  userId: string
  nickname: string | null
  starterId: StarterId
  home: LatLng | null
  onNicknameChanged: (nickname: string) => void
  onOpenBadges: () => void
  onClose: () => void
}

export function MyPage(p: Props) {
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [changingHome, setChangingHome] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([loadRecord(), loadCoins().catch(() => null)])
      .then(([r, coins]) => alive && setData({ cells: r.cells, visits: r.visits, towns: r.towns, coins }))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [attempt])

  const visited = data ? new Set(data.visits.map((v) => v.shopId)).size : 0
  const lv = levelFor(visited)
  const span = needFor(lv.level + 1) - needFor(lv.level)
  const progress = span > 0 ? (visited - needFor(lv.level)) / span : 0
  // 晴れた広さ = マス ＋ クリアした町（二重に数えない）
  const area = useMemo(() => (data ? areaTimeline(data.cells, data.towns) : null), [data])
  const badges = useMemo(
    () => (data && area ? evaluate({ visits: data.visits, cellTimes: area.cellTimes, townAreas: area.townAreas, home: p.home }) : []),
    [data, area, p.home],
  )
  const earnedCount = badges.filter((b) => b.earnedAt !== null).length
  const recent = recentEarned(badges, 3)

  const startEdit = () => {
    setDraft(p.nickname ?? '')
    setSaveError(null)
    setEditing(true)
  }
  const save = async () => {
    const c = checkNickname(draft)
    if (!c.ok) {
      setSaveError(c.reason === 'empty' ? 'ニックネームを入れてください' : `${NICKNAME_MAX}文字までです`)
      return
    }
    setSaving(true)
    try {
      await profileRepo.updateNickname(p.userId, c.value)
      p.onNicknameChanged(c.value)
      setEditing(false)
    } catch {
      setSaveError('保存できませんでした')
    } finally {
      setSaving(false)
    }
  }

  if (changingHome) return <ChangeHome userId={p.userId} onSaved={() => window.location.reload()} onCancel={() => setChangingHome(false)} />

  return (
    <section className="mp" aria-label="マイページ">
      <header className="mp__bar">
        <button type="button" className="mp__back" aria-label="戻る" onClick={p.onClose}>
          <Icon name="back" size={20} />
        </button>
        <h2>マイページ</h2>
      </header>

      <div className="mp__hero">
        <img src={characterUrl(p.starterId)} alt="" />
        <div className="mp__who">
          {editing ? (
            <div className="mp__edit">
              <input aria-label="ニックネーム" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={NICKNAME_MAX * 2} />
              <button type="button" onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
              <button type="button" className="mp__cancel" onClick={() => setEditing(false)}>やめる</button>
            </div>
          ) : (
            <div className="mp__name">
              <b>{p.nickname ?? 'あなた'}</b>
              <button type="button" aria-label="ニックネームを変える" onClick={startEdit}>
                <Icon name="pencil" size={18} />
              </button>
            </div>
          )}
          {saveError && <p className="mp__error" role="alert">{saveError}</p>}
          <div className="mp__lv">{`Lv ${lv.level}`}</div>
          <div className="mp__lvbar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <small>{`次の Lv まで あと ${lv.toNext}軒`}</small>
        </div>
      </div>

      {failed && (
        <div className="mp__note">
          <p role="alert">記録を読み込めませんでした</p>
          <button
            type="button"
            className="mp__retry"
            onClick={() => {
              setFailed(false)
              setAttempt((n) => n + 1)
            }}
          >
            もう一度
          </button>
        </div>
      )}
      {!data && !failed && <p className="mp__note">読み込んでいます…</p>}

      {data && (
        <>
          <div className="mp__cards">
            <div><b>{visited}</b><span>行ったお店</span></div>
            <div><b>{(area ? areaKm2At(area, Infinity) : 0).toFixed(2)}</b><span>晴れた広さ（km²）</span></div>
            <div><b>{earnedCount}</b><span>実績</span></div>
            <div><b>{data.coins ?? '—'}</b><span>グルメコイン</span></div>
          </div>

          <div className="mp__head">
            <h3>最近とった実績</h3>
            <button type="button" onClick={p.onOpenBadges}>すべて見る ›</button>
          </div>
          {recent.length === 0 ? (
            <p className="mp__note">まだありません。お店に行くと実績がもらえます</p>
          ) : (
            <div className="mp__badges">
              {recent.map((b) => <BadgeMedal key={b.def.id} state={b} size={92} />)}
            </div>
          )}
        </>
      )}

      <button type="button" className="mp__row" onClick={() => setChangingHome(true)}>
        <span><Icon name="home" size={20} />自宅の場所を変える</span>
        <span aria-hidden="true">›</span>
      </button>
    </section>
  )
}
