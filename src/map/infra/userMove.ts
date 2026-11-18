// 「人が地図を動かしている間」を知らせる（その間はお店のピンを隠す。カメラが屋根に追いつかずずれて見えるため）。
// 1本指の回転は MapView が setBearing で回すので originalEvent が付かず、1回ごとに moveend まで出る。
// そこで「指が地図に触れている間に動いた」か「originalEvent のある動き（ピンチ・ホイール）」を人の操作とみなす。
// 歩いてカメラが自動でついてくる動き（指なし・originalEvent なし）は数えない。
// 戻すのは、指が全部離れて、地図が止まったとき（惰性で動いていれば、その moveend まで待つ）
import type { Map as MapLibreMap } from 'maplibre-gl'

// 指が押した所から DRAG_PX より動いたら「なぞった」。それまではタップかもしれないので隠さない
// （歩いてカメラがついてくる間や、見て回るモードで指が少しぶれただけでピンが消えると、押せなくなる。2026-11-16 オーナー）
const DRAG_PX = 10

export function watchUserMove(map: MapLibreMap, onChange: (moving: boolean) => void): () => void {
  const container = map.getContainer()
  const downs = new Map<number, { x: number; y: number }>() // 触れている指と、押した所
  const dragged = new Set<number>() // そのうち、なぞった指
  let moving = false
  const set = (next: boolean) => {
    if (next === moving) return
    moving = next
    onChange(next)
  }
  // 人が動かしている: なぞっている指がある・2 本指（ピンチ）・指なしで originalEvent のある動き（PC のホイール）
  const userDriving = (e: { originalEvent?: unknown }) => dragged.size > 0 || downs.size >= 2 || (!!e.originalEvent && downs.size === 0)
  const onDown = (e: PointerEvent) => downs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  const onPointerMove = (e: PointerEvent) => {
    const d = downs.get(e.pointerId)
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) dragged.add(e.pointerId)
  }
  const onUp = (e: PointerEvent) => {
    downs.delete(e.pointerId)
    dragged.delete(e.pointerId)
    if (downs.size === 0 && !map.isMoving()) set(false)
  }
  const onMove = (e: { originalEvent?: unknown }) => {
    if (userDriving(e)) set(true)
  }
  // 止まった: なぞっている指・2 本指が無ければ戻す（惰性を指で止めて置いたままでも戻る）
  const onMoveEnd = () => {
    if (dragged.size === 0 && downs.size < 2) set(false)
  }
  // ピンは pointerdown を止める（地図のタップにしない）ので、捕捉の段階で数える。動き・離すのは地図の外でもありうるので window で見る
  container.addEventListener('pointerdown', onDown, true)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  map.on('move', onMove)
  map.on('moveend', onMoveEnd)
  return () => {
    container.removeEventListener('pointerdown', onDown, true)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    map.off('move', onMove)
    map.off('moveend', onMoveEnd)
  }
}
