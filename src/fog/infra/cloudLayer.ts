// 3Dの雲。種類ごと・区画ごとに InstancedMesh にまとめ、画面に入らない区画は three が描かない
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { localFrame } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { chunkOf } from '../domain/cloudSpots.ts'
import type { CloudSpot } from '../domain/cloudSpots.ts'
import { threeLayer } from '../../lib/threeLayer.ts'
import cloud1 from '../../assets/fog/cloud1.glb'
import cloud2 from '../../assets/fog/cloud2.glb'
import cloud3 from '../../assets/fog/cloud3.glb'

const URLS = [cloud1, cloud2, cloud3] // kind 0..2

type Model = { geo: THREE.BufferGeometry; width: number }

export function createCloudLayer(): CustomLayerInterface & { setSpots(spots: CloudSpot[], origin: LatLng): void } {
  let scene: THREE.Scene | null = null
  let map: MapLibreMap | null = null
  const models: (Model | null)[] = [null, null, null]
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  let meshes: THREE.InstancedMesh[] = []
  let spots: CloudSpot[] = []
  let origin: LatLng | null = null

  const clear = () => {
    for (const m of meshes) {
      scene?.remove(m)
      m.dispose() // インスタンスの行列のバッファを手放す（形は種類ごとに使い回すので残す）
    }
    meshes = []
  }

  const build = () => {
    clear()
    if (!scene || !origin) return
    const frame = localFrame(origin)
    const groups = new Map<string, CloudSpot[]>()
    for (const s of spots) {
      if (!models[s.kind]) continue
      const key = `${s.kind}/${chunkOf(s)}`
      const list = groups.get(key)
      if (list) list.push(s)
      else groups.set(key, [s])
    }
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const sc = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    for (const list of groups.values()) {
      const model = models[list[0].kind]!
      const inst = new THREE.InstancedMesh(model.geo, material, list.length)
      list.forEach((s, i) => {
        const p = frame.to(s)
        const k = s.widthM / model.width
        inst.setMatrixAt(i, m.compose(v.set(p.x, s.heightM, -p.y), q.setFromAxisAngle(up, s.rotRad), sc.set(k, k, k)))
      })
      inst.computeBoundingSphere()
      scene.add(inst)
      meshes.push(inst)
    }
    map?.triggerRepaint()
  }

  const layer = threeLayer({
    id: 'fog-clouds',
    onAdd(sc, m) {
      scene = sc
      map = m
      sc.add(new THREE.HemisphereLight('#ffffff', '#cfe3f7', 2.4))
      const sun = new THREE.DirectionalLight('#ffffff', 1.4)
      sun.position.set(-0.5, 0.9, 0.4)
      sc.add(sun)
      const loader = new GLTFLoader()
      URLS.forEach((url, kind) => {
        loader
          .loadAsync(url)
          .then((gltf) => {
            let mesh: THREE.Mesh | undefined
            gltf.scene.traverse((o) => {
              if ((o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
            })
            if (!mesh || !scene) return
            const geo = mesh.geometry
            geo.computeBoundingBox()
            const box = geo.boundingBox!
            models[kind] = { geo, width: box.max.x - box.min.x || 1 }
            build()
          })
          .catch(() => {}) // 読めなかった種類は出さない
      })
      build()
    },
    onRemove() {
      clear()
      for (const md of models) md?.geo.dispose()
      models.fill(null)
      material.dispose()
      scene = null
      map = null
    },
    origin: () => (meshes.length ? origin : null),
  })

  return {
    ...layer,
    setSpots(next, o) {
      spots = next
      origin = o
      build()
    },
  }
}
