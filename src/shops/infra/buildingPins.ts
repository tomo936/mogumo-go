// ビル（同じ建物の複数のお店）の上に出すピン（地図に貼る HTML マーカー）。
// 拡大中は店ごとのピンを少しずつずらして並べ、縮小中・多いときは1つ＋「済み/全部」にまとめる。
import { Marker } from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { localFrame } from '../../map/domain/geo.ts'
import { BUILDING_TOP_RATE } from '../config.ts'
import { BADGE_COLOR } from '../domain/badgeColor.ts'
import { pinLayout, pinScale } from '../domain/pins.ts'
import type { Shop } from '../domain/shop.ts'
import type { PlacedShop } from './shopLayer.ts'

export type PinnedBuilding = { placed: PlacedShop; shops: Shop[]; facility: boolean } // facility: 大型の施設

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

export function createBuildingPins(map: MapLibreMap, onTap: (shopIds: string[]) => void) {
  let markers: { m: Marker; b: PinnedBuilding; inner: HTMLElement; count: number }[] = []
  let buildings: PinnedBuilding[] = []
  let checked: ReadonlySet<string> = new Set()
  let collapsedKey = ''

  const keyOf = () => buildings.map((b) => (pinLayout(b.shops.length, map.getZoom(), b.facility) === 'collapsed' ? 1 : 0)).join('')

  // カメラに合わせて、ピンの大きさ（ビルの幅に収まる）と高さ（ビルの屋根の上）を合わせ直す
  const fit = () => {
    for (const { m, b, inner, count } of markers) {
      const base = map.project([b.placed.lng, b.placed.lat])
      const east = localFrame(b.placed).back({ x: 10, y: 0 })
      const e = map.project([east.lng, east.lat])
      const ppm = Math.hypot(e.x - base.x, e.y - base.y) / 10
      inner.style.transform = `scale(${pinScale(b.placed.sizeM, ppm, count).toFixed(3).replace(/\.?0+$/, '')})`
      m.setOffset([0, -b.placed.sizeM * BUILDING_TOP_RATE * ppm])
    }
  }

  const render = () => {
    for (const { m } of markers) m.remove()
    collapsedKey = keyOf()
    markers = buildings.map((b) => {
      const { placed, shops, facility } = b
      const outer = document.createElement('div')
      outer.className = 'bldg-pins'
      const el = document.createElement('div')
      el.className = 'bldg-pins__scale'
      outer.appendChild(el)
      outer.addEventListener('pointerdown', (e) => e.stopPropagation()) // 地図のタップ（建物の当たり判定）を走らせない
      const layout = pinLayout(shops.length, map.getZoom(), facility)
      if (layout === 'collapsed') {
        const done = shops.filter((s) => checked.has(s.id)).length
        const p = pin('#ffffff', '🍽', () => onTap(shops.map((s) => s.id)))
        p.classList.add('bldg-pin--all')
        const count = document.createElement('span')
        count.className = 'bldg-pin__count'
        count.textContent = `${done}/${shops.length}`
        p.prepend(count)
        el.appendChild(p)
      } else {
        layout.pins.forEach((at, i) => {
          const s = shops[i]
          const p = pin(BADGE_COLOR[s.kind], checked.has(s.id) ? '✓' : '', () => onTap([s.id]))
          p.style.transform = `translate(${at.x}px, ${at.y}px)`
          if (checked.has(s.id)) p.classList.add('bldg-pin--done')
          el.appendChild(p)
        })
        if (layout.more > 0) {
          // 並べきれないお店の数。押すと全部の一覧
          const more = document.createElement('button')
          more.type = 'button'
          more.className = 'bldg-pin__more'
          more.textContent = `+${layout.more}`
          more.addEventListener('click', (e) => {
            e.stopPropagation()
            onTap(shops.map((s) => s.id))
          })
          el.appendChild(more)
        }
      }
      const m = new Marker({ element: outer, anchor: 'bottom' }).setLngLat([placed.lng, placed.lat]).addTo(map)
      return { m, b, inner: el, count: layout === 'collapsed' ? 1 : layout.pins.length }
    })
    fit()
  }

  const onZoom = () => {
    if (keyOf() !== collapsedKey) render()
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
