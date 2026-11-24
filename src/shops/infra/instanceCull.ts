// 1 軒ずつの画面外の省き（2026-11-24 オーナー「新宿で重くない？」）。
// お店の模型は種類ごとに 1 つのまとまり（InstancedMesh）で描くので、three の「画面の外なら描かない」はまとまり全体の範囲（1km 四方）でしか効かず、
// カメラの後ろ・横・描画距離の奥の模型も毎コマ描いていた（新宿・倍率 19 で 1 コマ 290 万頂点のうち 220 万がお店の模型）。
// 描く前に 1 軒ずつカメラの見える範囲（奥の面も含む）と比べ、入る分だけを先頭に詰めて count を減らす
import * as THREE from 'three'

export type CullGroup<T> = {
  meshes: THREE.InstancedMesh[] // 同じ種類の部品ごとのまとまり（どれも items と同じ並び）
  full: THREE.Matrix4[][] // full[部品][軒] = その軒のその部品の置き方
  spheres: THREE.Sphere[] // 軒ごとの模型が収まる球（シーンの m）
  items: T[] // 軒ごとの元のデータ（押されたお店を instanceId から引く）
  shown: string // 前回描いた軒の番号（同じなら書き直さない）
}

// 見える範囲に入る軒だけを描くように詰める。描く軒が変わったら true
export function cull<T>(g: CullGroup<T>, frustum: THREE.Frustum): boolean {
  const idx: number[] = []
  g.spheres.forEach((s, i) => {
    if (frustum.intersectsSphere(s)) idx.push(i)
  })
  const key = idx.join(',')
  if (key === g.shown) return false
  g.shown = key
  const visible = idx.map((i) => g.items[i])
  g.meshes.forEach((mesh, part) => {
    idx.forEach((i, j) => mesh.setMatrixAt(j, g.full[part][i]))
    mesh.count = idx.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.userData.shops = visible // 当たった instanceId（詰めたあとの番号）から店を引く
  })
  return true
}
