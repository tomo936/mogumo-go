// ビル（同じ建物の複数のお店）の上に出すピン（地図に貼る HTML マーカー）。
// 拡大中は店ごとのピンを少しずつずらして並べ、縮小中・多いときは1つ＋「済み/全部」にまとめる。
import { Marker } from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { BUILDING_PIN_OFFSET_PER_SIZE } from '../config.ts'
import { BADGE_COLOR } from '../domain/badgeColor.ts'
import { pinLayout } from '../domain/pins.ts'
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
  let markers: Marker[] = []
  let buildings: PinnedBuilding[] = []
  let checked: ReadonlySet<string> = new Set()
  let collapsedKey = ''

  const keyOf = () => buildings.map((b) => (pinLayout(b.shops.length, map.getZoom(), b.facility) === 'collapsed' ? 1 : 0)).join('')

  const render = () => {
    for (const m of markers) m.remove()
    collapsedKey = keyOf()
    markers = buildings.map(({ placed, shops, facility }) => {
      const el = document.createElement('div')
      el.className = 'bldg-pins'
      el.addEventListener('pointerdown', (e) => e.stopPropagation()) // 地図のタップ（建物の当たり判定）を走らせない
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
      return new Marker({ element: el, offset: [0, -placed.sizeM * BUILDING_PIN_OFFSET_PER_SIZE], anchor: 'bottom' })
        .setLngLat([placed.lng, placed.lat])
        .addTo(map)
    })
  }

  const onZoom = () => {
    if (keyOf() !== collapsedKey) render()
  }
  map.on('zoomend', onZoom)

  return {
    update(next: PinnedBuilding[], nextChecked: ReadonlySet<string>) {
      buildings = next
      checked = nextChecked
      render()
    },
    dispose() {
      map.off('zoomend', onZoom)
      for (const m of markers) m.remove()
      markers = []
    },
  }
}
