// 見るだけの地図（ワールドマップから飛んだ先）。真上の地図に、記録と同じ雲。行ったお店のピンだけ出す（仕様 S1）。
// チェックインはできない。左上の「ワールドマップ」で戻る。「今いる場所に戻る」で記録ごと閉じる。
// 「見ているだけ」の帯は出さない（2026-11-12 オーナー）。
import type { TownProgress } from '../../towns/domain/progress.ts'
import { nextGoal, percent } from '../../towns/domain/progress.ts'
import { useMemo, useState } from 'react'
import { RecordMap } from '../../record/ui/RecordMap.tsx'
import type { ClearedCell, VisitEntry } from '../../record/domain/timeline.ts'
import type { DayPin } from '../../record/domain/dayPins.ts'
import type { ClearedTown } from '../../towns/domain/shape.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { ShopSheet } from '../../checkin/ui/ShopSheet.tsx'
import type { Shop } from '../../shops/domain/shop.ts'
import { addVisit } from '../../checkin/domain/visits.ts'
import type { Visits } from '../../checkin/domain/visits.ts'
import './world.css'

type Props = {
  center: LatLng
  zoom: number
  cells: ClearedCell[]
  towns: ClearedTown[]
  visits: VisitEntry[]
  home: LatLng | null
  onBack: () => void
  onReturn: () => void
  town?: TownProgress | null // 旗から開いた町の進み具合（2026-11-24 町のコンプリートの存在感を上げる）
  onLocate?: (shop: Shop) => void // お店のシートの「地図で見る」: いつもの地図でそのお店へ寄せる（図鑑と同じ。2026-11-17 オーナー）
}

type Placed = VisitEntry & { lat: number; lng: number }

export function PlaceView({ center, zoom, cells, towns, visits, home, onBack, onReturn, onLocate, town = null }: Props) {
  const [now] = useState(() => Date.now())
  const [openId, setOpenId] = useState<string | null>(null)
  const focus = useMemo(() => ({ center, zoom }), [center, zoom])

  // お店ごとに 1 つ（最新の日）。位置の無い訪問は出さない
  const shops = useMemo(() => {
    const m = new Map<string, Placed>()
    for (const v of visits) {
      if (v.lat === null || v.lng === null) continue
      const cur = m.get(v.shopId)
      if (!cur || v.at > cur.at) m.set(v.shopId, v as Placed)
    }
    return m
  }, [visits])
  const pins = useMemo<DayPin[]>(
    () => [...shops.values()].map((v) => ({ shopId: v.shopId, name: v.name, kind: v.kind, lat: v.lat, lng: v.lng, today: true, order: null, lastDay: v.day })),
    [shops],
  )
  const open = openId ? shops.get(openId) : undefined
  const openVisits = useMemo<Visits | null>(() => {
    if (!openId) return null
    let r: Visits | undefined
    for (const v of visits) if (v.shopId === openId) r = addVisit(r, v.day)
    return r ?? null
  }, [openId, visits])

  const openShop: Shop | null = open ? { id: open.shopId, name: open.name, lat: open.lat, lng: open.lng, kind: open.kind, details: null, mapId: null } : null

  return (
    <section className="vw" aria-label="見るだけの地図">
      <RecordMap cells={cells} towns={towns} t={now} home={home} pins={pins} wave={false} focus={focus} onPinTap={setOpenId} />
      {town && <TownCard town={town} />}
      <button type="button" className="vw-world" aria-label="ワールドマップへ戻る" onClick={onBack}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ワールドマップ
      </button>
      {!open && (
        <button type="button" className="vw-back" onClick={onReturn}>
          <span aria-hidden="true">📍</span>今いる場所に戻る
        </button>
      )}
      {open && (
        <ShopSheet
          viewOnly
          shop={openShop!}
          onLocate={onLocate && openShop ? () => onLocate(openShop) : undefined}
          distanceM={distanceMeters(home ?? center, open)}
          visits={openVisits}
          recordReady
          busy={false}
          error={null}
          onCheckin={() => {}}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  )
}

// 町の進み具合の札（旗から開いたとき、地図の上に出す。2026-11-24）
function TownCard({ town }: { town: TownProgress }) {
  const pct = percent(town)
  const goal = nextGoal(town)
  const mark = town.completedAt !== null ? 'コンプリート' : town.clearedAt !== null ? 'クリア' : null
  return (
    <div className="vw-town" aria-label={`${town.name} ${town.visited} / ${town.total} 軒`}>
      <div className="vw-town__head">
        <b>{town.name}</b>
        {mark && <span className="vw-town__stamp">{mark}</span>}
        <span className="vw-town__num">{`${town.visited} / ${town.total} 軒・${pct}%`}</span>
      </div>
      <i className="vw-town__bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></i>
      {goal && <p className="vw-town__goal">{goal.to === 'clear' ? 'クリアまで' : 'コンプリートまで'}あと <b>{goal.left}</b> 軒</p>}
    </div>
  )
}
