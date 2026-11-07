// ビル・大型施設の上に出すピン（地図に貼る HTML マーカー）。
// ビル: 拡大中は店ごとのピンを少しずつずらして並べる（6軒以上は5つ＋「+N」）。縮小中は1つ＋「済み/全部」。
// 大型施設: 遠くでは1つ＋「済み/全部」。拡大したら、屋根の上の各店の位置に散らばる（近い店は塊にし、4軒以上は「+N」の札）。
import { Marker } from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { localFrame } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { FACILITY_CLUSTER_PX, PIN_GAP_PX } from '../config.ts'
import { BADGE_COLOR } from '../domain/badgeColor.ts'
import { clusterSpots, pinLayout, pinScale } from '../domain/pins.ts'
import type { Shop } from '../domain/shop.ts'
import { screenScale } from './screenScale.ts'
import type { PlacedShop } from './shopLayer.ts'

// facility: 大型の施設。topM: 屋根の高さ（m）。spots: 施設の店の位置（placed からの m、x=東・y=北。ビルは []）
export type PinnedBuilding = { placed: PlacedShop; shops: Shop[]; facility: boolean; topM: number; spots: { id: string; x: number; y: number }[] }

const SCATTER_SIZE_M = 10 // 散らばったピンの大きさを決める目安の幅

function pin(color: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'bldg-pin'
  b.style.setProperty('--pin-color', color)
  b.innerHTML = '<span class="bldg-pin__head"><span class="bldg-pin__label"></span></span>'
  b.querySelector('.bldg-pin__label')!.textContent = label
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  return b
}

function moreTag(n: number, onClick: () => void): HTMLButtonElement {
  const more = document.createElement('button')
  more.type = 'button'
  more.className = 'bldg-pin__more'
  more.textContent = `+${n}`
  more.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  return more
}

type Shown = { m: Marker; b: PinnedBuilding; at: LatLng; inner: HTMLElement; count: number; sizeM: number; last: string }

export function createBuildingPins(map: MapLibreMap, onTap: (shopIds: string[]) => void) {
  let markers: Shown[] = []
  let buildings: PinnedBuilding[] = []
  let checked: ReadonlySet<string> = new Set()
  let shownKey = ''

  // 作り直しが要るか: まとめ方が変わった・散らばりモードでズームが変わった（塊の分け方が変わる）
  const keyOf = () =>
    buildings
      .map((b) => {
        const l = pinLayout(b.shops.length, map.getZoom(), b.facility)
        return l === 'scatter' ? `s${Math.round(map.getZoom() * 2)}` : l === 'collapsed' ? 'c' : 'p'
      })
      .join(',')

  // カメラに合わせて、ピンの大きさ（建物の幅に収まる）と高さ（屋根の上）を合わせ直す
  // 縮み具合は建物ごとに1回だけ測り、前と同じなら書き直さない（散らばったピンは数十個になるため）
  const fit = () => {
    const scaleOf = new Map<PinnedBuilding, ReturnType<typeof screenScale>>()
    for (const s of markers) {
      let sc = scaleOf.get(s.b)
      if (!sc) {
        sc = screenScale((p) => map.project([p.lng, p.lat]), s.b.placed)
        scaleOf.set(s.b, sc)
      }
      const scale = pinScale(s.sizeM, sc.pxPerM, s.count).toFixed(3).replace(/\.?0+$/, '')
      const offset = Math.round(-s.b.topM * sc.pxPerUpM * 10) / 10
      const key = `${scale}|${offset}`
      if (key === s.last) continue
      s.last = key
      s.inner.style.transform = `scale(${scale})`
      s.m.setOffset([0, offset])
    }
  }

  const marker = (b: PinnedBuilding, at: LatLng, fill: (el: HTMLElement) => number, sizeM: number): Shown => {
    const outer = document.createElement('div')
    outer.className = 'bldg-pins'
    const el = document.createElement('div')
    el.className = 'bldg-pins__scale'
    outer.appendChild(el)
    outer.addEventListener('pointerdown', (e) => e.stopPropagation()) // 地図のタップ（建物の当たり判定）を走らせない
    const count = fill(el)
    const m = new Marker({ element: outer, anchor: 'bottom' }).setLngLat([at.lng, at.lat]).addTo(map)
    return { m, b, at, inner: el, count, sizeM, last: '' }
  }

  const collapsed = (b: PinnedBuilding) => (el: HTMLElement) => {
    const done = b.shops.filter((s) => checked.has(s.id)).length
    const p = pin('#ffffff', '🍽', () => onTap(b.shops.map((s) => s.id)))
    p.classList.add('bldg-pin--all')
    const count = document.createElement('span')
    count.className = 'bldg-pin__count'
    count.textContent = `${done}/${b.shops.length}`
    p.prepend(count)
    el.appendChild(p)
    return 1
  }

  // 店のピンを横に並べる（xs は px のずれ）
  const row = (shops: Shop[], xs: { x: number; y: number }[]) => (el: HTMLElement) => {
    xs.forEach((at, i) => {
      const s = shops[i]
      const p = pin(BADGE_COLOR[s.kind], checked.has(s.id) ? '✓' : '', () => onTap([s.id]))
      p.style.transform = `translate(${at.x}px, ${at.y}px)`
      if (checked.has(s.id)) p.classList.add('bldg-pin--done')
      el.appendChild(p)
    })
    return xs.length
  }

  const render = () => {
    for (const { m } of markers) m.remove()
    shownKey = keyOf()
    markers = []
    for (const b of buildings) {
      const layout = pinLayout(b.shops.length, map.getZoom(), b.facility)
      const home: LatLng = { lat: b.placed.lat, lng: b.placed.lng }
      if (layout === 'collapsed') {
        markers.push(marker(b, home, collapsed(b), b.placed.sizeM))
      } else if (layout === 'scatter') {
        const { pxPerM } = screenScale((p) => map.project([p.lng, p.lat]), home)
        const frame = localFrame(home)
        const byId = new Map(b.shops.map((s) => [s.id, s]))
        for (const c of clusterSpots(b.spots, FACILITY_CLUSTER_PX / (pxPerM || 1))) {
          const at = frame.back({ x: c.x, y: c.y })
          const shops = c.ids.map((id) => byId.get(id)!).filter(Boolean)
          if (shops.length >= 4) {
            markers.push(marker(b, at, (el) => (el.appendChild(moreTag(shops.length, () => onTap(c.ids))), 1), SCATTER_SIZE_M))
          } else {
            const mid = (shops.length - 1) / 2
            markers.push(marker(b, at, row(shops, shops.map((_, i) => ({ x: (i - mid) * PIN_GAP_PX, y: 0 }))), SCATTER_SIZE_M))
          }
        }
      } else {
        markers.push(
          marker(
            b,
            home,
            (el) => {
              const n = row(b.shops, layout.pins)(el)
              if (layout.more > 0) el.appendChild(moreTag(layout.more, () => onTap(b.shops.map((s) => s.id))))
              return n
            },
            b.placed.sizeM,
          ),
        )
      }
    }
    fit()
  }

  const onZoom = () => {
    if (keyOf() !== shownKey) render()
  }
  map.on('zoomend', onZoom)
  map.on('move', fit)

  return {
    update(next: PinnedBuilding[], nextChecked: ReadonlySet<string>) {
      buildings = next
      checked = nextChecked
      render()
    },
    dispose() {
      map.off('zoomend', onZoom)
      map.off('move', fit)
      for (const { m } of markers) m.remove()
      markers = []
    },
  }
}
