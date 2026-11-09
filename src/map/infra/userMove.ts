// 「人が地図を動かしている間」を知らせる（その間はお店のピンを隠す。カメラが屋根に追いつかずずれて見えるため）。
// 1本指の回転は MapView が setBearing で回すので originalEvent が付かず、1回ごとに moveend まで出る。
// そこで「指が地図に触れている間に動いた」か「originalEvent のある動き（ピンチ・ホイール）」を人の操作とみなす。
// 歩いてカメラが自動でついてくる動き（指なし・originalEvent なし）は数えない。
// 戻すのは、指が全部離れて、地図が止まったとき（惰性で動いていれば、その moveend まで待つ）
import type { Map as MapLibreMap } from 'maplibre-gl'

export function watchUserMove(map: MapLibreMap, onChange: (moving: boolean) => void): () => void {
  const container = map.getContainer()
  const touching = new Set<number>()
  let moving = false
  const set = (next: boolean) => {
    if (next === moving) return
    moving = next
    onChange(next)
  }
  const onDown = (e: PointerEvent) => touching.add(e.pointerId)
  const onUp = (e: PointerEvent) => {
    touching.delete(e.pointerId)
    if (touching.size === 0 && !map.isMoving()) set(false)
  }
  const onMove = (e: { originalEvent?: unknown }) => {
    if (e.originalEvent || touching.size > 0) set(true)
  }
  const onMoveEnd = () => {
    if (touching.size === 0) set(false)
  }
  // ピンは pointerdown を止める（地図のタップにしない）ので、捕捉の段階で数える。離すのは地図の外でもありうるので window で見る
  container.addEventListener('pointerdown', onDown, true)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  map.on('move', onMove)
  map.on('moveend', onMoveEnd)
  return () => {
    container.removeEventListener('pointerdown', onDown, true)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    map.off('move', onMove)
    map.off('moveend', onMoveEnd)
  }
}
