// 見るだけの地図（ワールドマップから飛んだ先）。真上の地図に、記録と同じ雲。行ったお店のピンだけ出す（仕様 S1）。
// チェックインはできない。「今いる場所に戻る」で記録ごと閉じる。
import { useMemo, useState } from 'react'
import { RecordMap } from '../../record/ui/RecordMap.tsx'
import type { ClearedCell, VisitEntry } from '../../record/domain/timeline.ts'
import type { DayPin } from '../../record/domain/dayPins.ts'
import type { ClearedTown } from '../../towns/domain/shape.ts'
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { ShopSheet } from '../../checkin/ui/ShopSheet.tsx'
import { addVisit } from '../../checkin/domain/visits.ts'
import type { Visits } from '../../checkin/domain/visits.ts'
import closeArt from '../../assets/ui/icon-close.webp'
import './world.css'

type Props = {
  title: string
  center: LatLng
  zoom: number
  cells: ClearedCell[]
  towns: ClearedTown[]
  visits: VisitEntry[]
  home: LatLng | null
  onBack: () => void
  onReturn: () => void
}

type Placed = VisitEntry & { lat: number; lng: number }

export function PlaceView({ title, center, zoom, cells, towns, visits, home, onBack, onReturn }: Props) {
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

  return (
    <section className="vw" aria-label="見るだけの地図">
      <RecordMap cells={cells} towns={towns} t={now} home={home} pins={pins} wave={false} focus={focus} onPinTap={setOpenId} />
      <div className="vw-band">
        <b>👀 見ているだけ</b>
        <small>{title}・チェックインはできません</small>
        <button type="button" className="x" aria-label="閉じる" onClick={onBack}>
          <img src={closeArt} alt="" />
        </button>
      </div>
      <button type="button" className="vw-back" onClick={onReturn}>
        <span aria-hidden="true">📍</span>今いる場所に戻る
      </button>
      {open && (
        <ShopSheet
          viewOnly
          shop={{ id: open.shopId, name: open.name, lat: open.lat, lng: open.lng, kind: open.kind, details: null, mapId: null }}
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
