import { Marker } from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { AVATAR_FPS, AVATAR_FRAMES, AVATAR_HEIGHT_PX, AVATAR_MIN_MOVE_M } from '../config.ts'
import { bearingDeg, facingFor, isWalking, smoothSpeed } from '../domain/avatar.ts'
import type { Facing } from '../domain/avatar.ts'
import { distanceMeters } from '../domain/geo.ts'
import type { LatLng } from '../domain/geo.ts'

// 自分のアバター（お試し版）。今は選んだキャラに関係なく全員、男の子の歩く絵。
// 8 方向 × 21 コマの横並びシート（art/prototypes/make-walk-sheets.sh で作る）を
// HTML マーカーの background-position で送る。足元が自分の位置。
const sheets = import.meta.glob('../../assets/characters/boy-walk/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const sheetUrl = (f: Facing) => sheets[`../../assets/characters/boy-walk/${f}.webp`]!

const FRAME_W = Math.round((AVATAR_HEIGHT_PX * 62) / 120) // シートの1コマは 62x120 の比率

export function createAvatar(map: MapLibreMap) {
  const el = document.createElement('div')
  el.className = 'me-avatar'
  el.style.width = `${FRAME_W}px`
  el.style.height = `${AVATAR_HEIGHT_PX}px`
  el.style.backgroundSize = `${FRAME_W * AVATAR_FRAMES}px ${AVATAR_HEIGHT_PX}px`
  const marker = new Marker({ element: el, anchor: 'bottom' })

  let added = false
  let facing: Facing = 'front'
  let shownFacing: Facing | null = null
  let ref: LatLng | null = null // 向きを出すときの基準の位置
  let last: LatLng | null = null
  let travel: number | null = null // 最後に進んだ方位（止まっても残す）
  let speed = 0
  let frame = 0
  let clock = 0 // 歩いている間だけ進む時間（ms）

  return {
    // 毎コマ、ならした位置 pos で呼ぶ
    update(pos: LatLng, dtMs: number) {
      if (last) speed = smoothSpeed(speed, distanceMeters(last, pos), dtMs)
      last = pos
      if (!ref) ref = pos
      else if (distanceMeters(ref, pos) >= AVATAR_MIN_MOVE_M) {
        // 進む向き（前回→今回）の方位。見た目の向きは地図の回転を引いて毎コマ決める
        travel = bearingDeg(ref, pos)
        ref = pos
      }
      facing = travel === null ? facing : facingFor(travel, map.getBearing())
      const walking = isWalking(speed)
      el.classList.toggle('me-avatar--idle', !walking) // 立っている間は、息をするように少し揺れる（CSS）
      if (walking) {
        clock += dtMs
        frame = Math.floor((clock / 1000) * AVATAR_FPS) % AVATAR_FRAMES
      } else {
        clock = 0
        frame = 0 // 止まったら1コマ目
      }
      if (facing !== shownFacing) {
        el.style.backgroundImage = `url(${sheetUrl(facing)})`
        shownFacing = facing
      }
      el.style.backgroundPosition = `${-frame * FRAME_W}px 0`
      marker.setLngLat([pos.lng, pos.lat])
      if (!added) {
        marker.addTo(map)
        added = true
      }
    },
    // 進んでいる向き（北0・時計回りの度）。まだ進んでいなければ 0
    heading: () => travel ?? 0,
    // 3D の男の子が出ているときは、2D の絵を隠す
    setHidden(hidden: boolean) {
      el.style.display = hidden ? 'none' : ''
    },
    dispose() {
      marker.remove()
    },
  }
}