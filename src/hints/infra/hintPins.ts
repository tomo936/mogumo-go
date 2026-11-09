// 気配のピン（地図に貼る HTML マーカー）。最大3つ。霧（WebGL の層）の手前に出るので、雲の上に必ず見える。
// 仮の見た目は丸＋「？」。シロのアイコンが届いたら中身を差し替える。
import { Marker } from 'maplibre-gl'
import mysteryPin from '../../assets/pins/mystery.png'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { LatLng } from '../../map/domain/geo.ts'
import type { DailyHint } from '../domain/hint.ts'

const BOUNCE_MS = 400

type Shown = { m: Marker; el: HTMLButtonElement; id: string; timer: ReturnType<typeof setTimeout> | null }

export function createHintPins(map: MapLibreMap, onTap: (hintId: string) => void) {
  let shown: Shown[] = []
  let shownKey = ''

  const clear = () => {
    for (const s of shown) {
      if (s.timer) clearTimeout(s.timer)
      s.m.remove()
    }
    shown = []
  }

  return {
    // 達成済みは出さない。内容が前と同じなら作り直さない
    update(hints: readonly DailyHint[], positions: ReadonlyMap<string, LatLng>, revealed: ReadonlySet<string>) {
      const list = hints.filter((h) => !h.completed && positions.has(h.id))
      const key = list
        .map((h) => {
          const p = positions.get(h.id)!
          return `${h.id}@${p.lat},${p.lng}:${h.isMystery ? 'm' : 'n'}${revealed.has(h.id) ? 'r' : ''}`
        })
        .join('|')
      if (key === shownKey) return
      shownKey = key
      clear()
      for (const h of list) {
        const p = positions.get(h.id)!
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'hint-pin'
        if (h.isMystery) el.classList.add('hint-pin--mystery')
        if (revealed.has(h.id)) el.classList.add('hint-pin--revealed')
        el.setAttribute('aria-label', revealed.has(h.id) ? '気配（正体が分かった）' : '気配')
        // 気配はジャンルが分からないよう、どれもシロの「？」のピンの絵（色で種類がばれない）
        el.innerHTML = '<span class="hint-pin__face"><img class="hint-pin__img" alt="" draggable="false"></span>'
        el.querySelector<HTMLImageElement>('.hint-pin__img')!.src = mysteryPin
        if (revealed.has(h.id)) {
          const mark = document.createElement('span')
          mark.className = 'hint-pin__mark'
          mark.textContent = '!'
          el.appendChild(mark)
        }
        el.addEventListener('pointerdown', (e) => e.stopPropagation()) // 地図のタップ（建物の当たり判定）を走らせない
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onTap(h.id)
        })
        // ピンの先を地面の点に付ける（画面の px で浮かせると、カメラを引く・回すとずれて見える）
        const m = new Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map)
        shown.push({ m, el, id: h.id, timer: null })
      }
    },
    // ぽんと弾ませる（約0.4秒）
    bounce(hintId: string) {
      const s = shown.find((x) => x.id === hintId)
      if (!s) return
      if (s.timer) clearTimeout(s.timer)
      s.el.classList.remove('hint-pin--bounce')
      void s.el.offsetWidth // 同じ動きをもう一度始められるように
      s.el.classList.add('hint-pin--bounce')
      s.timer = setTimeout(() => {
        s.el.classList.remove('hint-pin--bounce')
        s.timer = null
      }, BOUNCE_MS)
    },
    dispose() {
      clear()
      shownKey = ''
    },
  }
}
