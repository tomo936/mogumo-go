// ビル・大型施設の上に出すピン（地図に貼る HTML マーカー）。
// ビル: 拡大中は店ごとのピンを少しずつずらして並べる（6軒以上は5つ＋「+N」）。縮小中は1つ＋「済み/全部」。
// 大型施設: 遠くでは1つ＋「済み/全部」。拡大したら、屋根の上の各店の位置に散らばる（近い店は塊にし、4軒以上は「+N」の札）。
import { Marker } from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { localFrame } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { FACILITY_CLUSTER_PX, PIN_GAP_PX } from '../config.ts'
import { clusterSpots, pinLayout, pinScale } from '../domain/pins.ts'
import type { Shop } from '../domain/shop.ts'
import { projectAt } from '../../lib/threeLayer.ts'
import { PIN_ICON } from './pinIcons.ts'
import { CLUSTER_UNTIL_ZOOM } from '../domain/cluster.ts'
import { screenScale } from './screenScale.ts'
import type { PlacedShop } from './shopLayer.ts'

// facility: 大型の施設。topM: 屋根の高さ（m）。spots: 施設の店の位置（placed からの m、x=東・y=北）と、その上の屋根の高さ（m。ビルは []）
// label: 名前の札（station なら駅名標の形）
export type PinnedBuilding = {
  placed: PlacedShop
  shops: Shop[]
  facility: boolean
  topM: number
  spots: { id: string; x: number; y: number; topM: number }[]
  label: { text: string; station: boolean } | null
}

// ?debug の表示用。at: ピンの地面の点／ground: map.project の画面位置／lift: projectAt で求めた持ち上げ（dx,dy。まだ描いていなければ null）
// groundDiff: projectAt(…,0) と map.project の地面の点の差（px）／scale: pinScale の値
export type PinDebugRow = {
  at: LatLng
  topM: number
  ground: { x: number; y: number }
  lift: { x: number; y: number } | null
  groundDiff: { x: number; y: number } | null
  scale: number
}

// 地図の入れ物に付ける class。css 側（checkin.css）で .bldg-pins を隠す
const MOVING_CLASS = 'pins-moving' // 人が地図を動かしている間
const HIDDEN_CLASS = 'pins-off' // 「ピンを出さない」のボタン
const FAR_CLASS = 'pins-far' // 引いている（まとめのピンに任せる）

const SCATTER_SIZE_M = 16 // 散らばったピンの大きさを決める目安の幅（2026-11-09 本人「施設の中のピンも小さい」で 10→16）

// お店のピン。icon があればシロのピンの絵（先が下の真ん中）、無ければ白い丸（まとめたピン）
function pin(icon: string | null, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = icon ? 'bldg-pin bldg-pin--icon' : 'bldg-pin'
  if (icon) {
    const img = document.createElement('img')
    img.className = 'bldg-pin__img'
    img.src = icon
    img.alt = ''
    img.draggable = false
    b.appendChild(img)
    if (label) {
      // 1つのお店のピン（checkBadge.ts の canvas の絵）と同じ印: 右上に白いふちの緑の丸と、線で描いた ✓。
      // 文字の ✓ は iPhone で四角っぽい形になるので使わない
      const mark = document.createElement('span')
      mark.className = 'bldg-pin__mark'
      mark.setAttribute('aria-label', '済み')
      mark.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#fff"/><circle cx="12" cy="12" r="10.1" fill="#3ecf8e"/>' +
        '<path d="M7.4 12.2l3.6 3.6 6-6.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      b.appendChild(mark)
    }
  } else {
    b.innerHTML = '<span class="bldg-pin__head"><span class="bldg-pin__label"></span></span>'
    b.querySelector('.bldg-pin__label')!.textContent = label
  }
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

// topM: ピンを浮かせる高さ（m）。散らばったピンは塊の店の屋根のうち一番高いもの、それ以外は b.topM
type Shown = { m: Marker; b: PinnedBuilding; at: LatLng; inner: HTMLElement; count: number; sizeM: number; topM: number; last: string }

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
      // 屋根の点を 3D と同じカメラで写し、地面の点からのずれをそのまま使う（遠近で傾いた分も合う）。
      // まだ 3D を描いていないときだけ、画面の真上にずらす近似
      const ground = projectAt(map, s.at, 0)
      const top = ground ? projectAt(map, s.at, s.topM) : null
      const dx = ground && top ? Math.round((top.x - ground.x) * 10) / 10 : 0
      const dy = ground && top ? Math.round((top.y - ground.y) * 10) / 10 : Math.round(-s.topM * sc.pxPerUpM * 10) / 10
      const key = `${scale}|${dx}|${dy}`
      if (key === s.last) continue
      s.last = key
      s.inner.style.transform = `scale(${scale})`
      s.m.setOffset([dx, dy])
    }
  }

  // ?debug 用: いまのピンごとの測定値（呼ばれたときだけ測る。ふだんは何もしない）
  const debugRows = (): PinDebugRow[] =>
    markers.map((s) => {
      const sc = screenScale((p) => map.project([p.lng, p.lat]), s.b.placed)
      const g = map.project([s.at.lng, s.at.lat])
      const g3 = projectAt(map, s.at, 0)
      const top = g3 ? projectAt(map, s.at, s.topM) : null
      return {
        at: s.at,
        topM: s.topM,
        ground: { x: g.x, y: g.y },
        lift: g3 && top ? { x: top.x - g3.x, y: top.y - g3.y } : null,
        groundDiff: g3 ? { x: g3.x - g.x, y: g3.y - g.y } : null,
        scale: pinScale(s.sizeM, sc.pxPerM, s.count),
      }
    })

  const marker = (b: PinnedBuilding, at: LatLng, fill: (el: HTMLElement) => number, sizeM: number, topM = b.topM): Shown => {
    const outer = document.createElement('div')
    outer.className = 'bldg-pins'
    const el = document.createElement('div')
    el.className = 'bldg-pins__scale'
    outer.appendChild(el)
    outer.addEventListener('pointerdown', (e) => e.stopPropagation()) // 地図のタップ（建物の当たり判定）を走らせない
    const count = fill(el)
    const m = new Marker({ element: outer, anchor: 'bottom' }).setLngLat([at.lng, at.lat]).addTo(map)
    return { m, b, at, inner: el, count, sizeM, topM, last: '' }
  }

  const nameTag = (b: PinnedBuilding): HTMLElement | null => {
    if (!b.label) return null
    const n = document.createElement('div')
    n.className = b.label.station ? 'bldg-name bldg-name--station' : 'bldg-name'
    n.textContent = b.label.text
    return n
  }

  const collapsed = (b: PinnedBuilding) => (el: HTMLElement) => {
    const tag = nameTag(b)
    if (tag) el.appendChild(tag)
    const done = b.shops.filter((s) => checked.has(s.id)).length
    const p = pin(null, '🍽', () => onTap(b.shops.map((s) => s.id)))
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
      const p = pin(PIN_ICON[s.kind], checked.has(s.id) ? '✓' : '', () => onTap([s.id]))
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
        // 名前の札は施設の真ん中に1つ
        if (b.label) markers.push(marker(b, home, (el) => (el.appendChild(nameTag(b)!), 1), b.placed.sizeM))
        const { pxPerM } = screenScale((p) => map.project([p.lng, p.lat]), home)
        const frame = localFrame(home)
        const byId = new Map(b.shops.map((s) => [s.id, s]))
        const topOf = new Map(b.spots.map((s) => [s.id, s.topM]))
        for (const c of clusterSpots(b.spots, FACILITY_CLUSTER_PX / (pxPerM || 1))) {
          const at = frame.back({ x: c.x, y: c.y })
          const shops = c.ids.map((id) => byId.get(id)!).filter(Boolean)
          const topM = Math.max(...c.ids.map((id) => topOf.get(id) ?? b.topM))
          if (shops.length >= 4) {
            markers.push(marker(b, at, (el) => (el.appendChild(moreTag(shops.length, () => onTap(c.ids))), 1), SCATTER_SIZE_M, topM))
          } else {
            const mid = (shops.length - 1) / 2
            markers.push(marker(b, at, row(shops, shops.map((_, i) => ({ x: (i - mid) * PIN_GAP_PX, y: 0 }))), SCATTER_SIZE_M, topM))
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
  map.on('render', fit) // 3D を描いたあと（そのコマのカメラ）で合わせる

  const container = map.getContainer()
  // 引いたとき（ズーム 17.5 より下）はビルのピンを隠す（shopClusters のまとめに入る）。名前の札は残す。2026-11-13
  const farClass = () => container.classList.toggle(FAR_CLASS, map.getZoom() < CLUSTER_UNTIL_ZOOM)
  map.on('zoom', farClass)
  farClass()

  return {
    update(next: PinnedBuilding[], nextChecked: ReadonlySet<string>) {
      buildings = next
      checked = nextChecked
      render()
    },
    debugRows,
    // 人が地図を動かしている間は隠す（カメラが屋根に追いつかず、ピンがずれて見えるため）。作り直しはせず class を付け外しするだけ
    setMoving(moving: boolean) {
      container.classList.toggle(MOVING_CLASS, moving)
    },
    // ピンと名前の札をまとめて出す・出さない（ボタン用）
    setHidden(hidden: boolean) {
      container.classList.toggle(HIDDEN_CLASS, hidden)
    },
    dispose() {
      container.classList.remove(MOVING_CLASS, HIDDEN_CLASS, FAR_CLASS)
      map.off('zoom', farClass)
      map.off('zoomend', onZoom)
      map.off('render', fit)
      for (const { m } of markers) m.remove()
      markers = []
    },
  }
}
