// お店の建物（13種の glb）。種類ごとに初めて要るときに読み、同じ種類はインスタンス描画で使い回す
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { localFrame } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { ShopKind } from '../domain/shop.ts'
import { threeLayer } from '../../lib/threeLayer.ts'
import { pickShop } from './pickShop.ts'

// 地図に置く建物1つ。1軒の店は model がその種類・shopIds が [id]。
// ビル（同じ建物の複数の店）は model 'building'・id 'bldg:<先頭の店 id>'・shopIds に全員
// light: 遠くの店は軽い模型（assets/shops/lod/）で描く
export type ModelName = ShopKind | 'building'
export type PlacedShop = { id: string; model: ModelName; shopIds: string[]; lat: number; lng: number; facingDeg: number; sizeM: number; light?: boolean }

const URLS = import.meta.glob<string>('../../assets/shops/*.glb', { query: '?url', import: 'default' })
const LOD_URLS = import.meta.glob<string>('../../assets/shops/lod/*.glb', { query: '?url', import: 'default' })
// 読み込む模型の見分け（詳しい版は種類の名前、軽い版は 'lod:' を付ける）
type ModelKey = ModelName | `lod:${ModelName}`
const keyOf = (s: PlacedShop): ModelKey => (s.light ? `lod:${s.model}` : s.model)
const urlOf = (key: ModelKey) => (key.startsWith('lod:') ? LOD_URLS[`../../assets/shops/lod/${key.slice(4)}.glb`] : URLS[`../../assets/shops/${key}.glb`])

// 読み込んだ模型: 部品ごとの形・材質と、模型の根元からの行列
type Part = { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }
type Model = { parts: Part[]; unit: number } // unit: 模型の幅（東西・南北の大きい方）

// id: 地図の層の名前（晴れた所の店と、霧の中の近い店で2つ作る）
export function createShopLayer(id: string): CustomLayerInterface & {
  setShops(shops: PlacedShop[]): void
  pick(point: { x: number; y: number }): string[] | null
} {
  let scene: THREE.Scene | null = null
  let map: MapLibreMap | null = null
  const models = new Map<ModelKey, Model | null>() // null = 読み込み中か失敗
  let meshes: THREE.InstancedMesh[] = []
  let shops: PlacedShop[] = []
  let origin: LatLng | null = null

  const clear = () => {
    for (const m of meshes) {
      scene?.remove(m)
      m.dispose()
    }
    meshes = []
  }

  const load = (kind: ModelKey) => {
    const url = urlOf(kind)
    models.set(kind, null)
    if (!url) return
    url()
      .then((u) => new GLTFLoader().loadAsync(u))
      .then((gltf) => {
        const parts: Part[] = []
        gltf.scene.updateMatrixWorld(true)
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const m of mats) (m as THREE.MeshStandardMaterial).envMapIntensity = 0 // 試作どおりマット
          parts.push({ geo: mesh.geometry, mat: mesh.material, local: mesh.matrixWorld.clone() })
        })
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const unit = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1
        models.set(kind, { parts, unit })
        build()
      })
      .catch(() => {}) // 読めなかった種類は出さない
  }

  // 描く模型: 欲しい方（詳しい・軽い）がまだ読めていなければ、もう片方が読めていればそれで代わりに出す（空白にしない）
  const drawnKey = (s: PlacedShop): ModelKey | null => {
    const want = keyOf(s)
    if (models.get(want)) return want
    const other: ModelKey = s.light ? s.model : `lod:${s.model}`
    return models.get(other) ? other : null
  }
  // 大きさの基準の幅: 同じ種類なら詳しい版の幅を両方に使う（切りかえで大きさが跳ねないように）。まだ読めていなければ軽い版の幅
  const unitOf = (model: ModelName) => (models.get(model) ?? models.get(`lod:${model}`))!.unit

  const build = () => {
    clear()
    if (!scene || !origin) return
    const frame = localFrame(origin)
    const byKind = new Map<ModelKey, PlacedShop[]>()
    for (const s of shops) {
      if (!models.has(keyOf(s))) load(keyOf(s))
      const key = drawnKey(s)
      if (!key) continue
      const list = byKind.get(key)
      if (list) list.push(s)
      else byKind.set(key, [s])
    }
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const sc = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    for (const [kind, list] of byKind) {
      const model = models.get(kind)!
      // 1軒ずつの置き方（m）。正面（模型の +z）を facingDeg（北0・時計回り）へ向ける
      const place = list.map((s) => {
        const p = frame.to(s)
        const k = s.sizeM / unitOf(s.model)
        return new THREE.Matrix4().compose(
          v.set(p.x, 0, -p.y),
          q.setFromAxisAngle(up, Math.PI - THREE.MathUtils.degToRad(s.facingDeg)),
          sc.set(k, k, k),
        )
      })
      for (const part of model.parts) {
        const inst = new THREE.InstancedMesh(part.geo, part.mat, list.length)
        place.forEach((pm, i) => inst.setMatrixAt(i, m.multiplyMatrices(pm, part.local)))
        inst.computeBoundingSphere()
        scene.add(inst)
        meshes.push(inst)
      }
    }
    map?.triggerRepaint()
  }

  const layer = threeLayer({
    id,
    onAdd(sc, mp) {
      scene = sc
      map = mp
      // 試作どおりの光（空の光＋太陽）
      sc.add(new THREE.HemisphereLight('#ffffff', '#e6dccf', 2.2))
      const sun = new THREE.DirectionalLight('#fff2e4', 2.4)
      sun.position.set(-0.6, 0.8, 0.55)
      sc.add(sun)
      build()
    },
    onRemove() {
      clear()
      for (const md of models.values()) {
        for (const p of md?.parts ?? []) {
          p.geo.dispose()
          for (const mt of Array.isArray(p.mat) ? p.mat : [p.mat]) mt.dispose()
        }
      }
      models.clear()
      scene = null
      map = null
    },
    origin: () => (meshes.length ? origin : null),
  })

  return {
    ...layer,
    setShops(next) {
      shops = next
      origin = next.length ? { lat: next[0].lat, lng: next[0].lng } : null
      build()
    },
    // 画面の点で押された建物の店の id（ビルなら全員。建物が出ているものだけ）
    pick(point) {
      if (!map) return null
      const m = map
      const drawn = shops.filter((s) => drawnKey(s))
      return pickShop(drawn, point, (p) => m.project([p.lng, p.lat]))?.shopIds ?? null
    },
  }
}
