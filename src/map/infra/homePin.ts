// 自宅のピン（A12、2026-11-17 オーナー「3D はやめて、ピンだけ。他のとは区別つけて」）。
// 絵はオーナーの家のアイコン（art/pins/home-icon.png）を、少し深い赤の枠に重ねたもの（src/assets/pins/home.png。
// 作り方 node art/prototypes/compose-pins.mjs home）。お店のピンより大きく、下に「おうち」の札。押してもぽんと弾むだけ。
// 自宅は端末の中だけ（サーバーに保存しない）なので、このピンも本人の地図にだけ出る
import { Marker } from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import homeUrl from '../../assets/pins/home.png'
import type { LatLng } from '../domain/geo.ts'

export function homePinElement(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'home-marker'
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', '自宅')
  const img = document.createElement('img')
  img.src = homeUrl
  img.alt = ''
  const label = document.createElement('span')
  label.className = 'home-marker__label'
  label.textContent = 'おうち'
  el.append(img, label)
  // 地図のタップ（お店を選ぶ）に伝えない
  const stop = (e: Event) => e.stopPropagation()
  el.addEventListener('pointerdown', stop)
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    el.classList.remove('home-marker--bounce')
    void el.offsetWidth // 続けて押しても弾み直す
    el.classList.add('home-marker--bounce')
  })
  return el
}

export function createHomePin(map: MapLibreMap, home: LatLng) {
  const marker = new Marker({ element: homePinElement(), anchor: 'bottom' }).setLngLat([home.lng, home.lat]).addTo(map)
  return { dispose: () => marker.remove() }
}
