// 自分の位置に、3D の男の子を立てる（揺れるだけ・骨組みなし）。店の模型と同じ地図の3D層を使う。
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { threeLayer } from '../../lib/threeLayer.ts'
import { AVATAR_HEIGHT_PX } from '../config.ts'
import { bobAmount, heightMeters } from '../domain/avatar3d.ts'
import type { LatLng } from '../domain/geo.ts'

const AVATARS = import.meta.glob<string>('../../assets/characters/avatar3d.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>

export function createAvatarModel(map: MapLibreMap) {
  const holder = new THREE.Group() // 位置・向き・大きさ（シーンの原点＝自分の位置、単位は m）
  const body = new THREE.Group() // 模型（高さ 1 に合わせてある）。揺れはここを上下させる
  holder.matrixAutoUpdate = false
  holder.add(body)
  let ready = false
  let pose: { pos: LatLng } | null = null

  const layer = threeLayer({
    id: 'me-avatar-3d',
    onAdd(scene) {
      scene.add(new THREE.HemisphereLight('#ffffff', '#e6dccf', 2.2))
      const sun = new THREE.DirectionalLight('#fff2e4', 2.4)
      sun.position.set(-0.6, 0.8, 0.55)
      scene.add(sun)
      scene.add(holder)
      const url = AVATARS['../../assets/characters/avatar3d.glb']
      if (!url) return
      new GLTFLoader()
        .loadAsync(url)
        .then((gltf) => {
          gltf.scene.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (!mesh.isMesh) return
            for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              const std = m as THREE.MeshStandardMaterial
              std.envMapIntensity = 0 // 店の模型と同じマットな見た目
              // ファイルに金属っぽさの値が無いと、glTF の決まりで「金属（1）」になり、映す景色が無いので真っ黒になる。
              // 布や肌なので、金属っぽさ 0・ざらっとした面にする（2026-11-10 黒く見えた原因）
              std.metalness = 0
              std.roughness = 0.85
            }
          })
          body.add(gltf.scene)
          ready = true
          map.triggerRepaint()
        })
        .catch(() => {}) // 読めなければ 2D の男の子のまま
    },
    onRemove() {
      body.clear()
      ready = false
    },
    origin: () => pose?.pos ?? null,
  })

  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  return {
    layer,
    ready: () => ready,
    // 毎コマ。heading は進む向き（北0・時計回りの度）。店の模型と同じ向き（正面は模型の +z）
    setPose(pos: LatLng, headingDeg: number, now: number) {
      pose = { pos }
      const h = heightMeters(AVATAR_HEIGHT_PX, map.getZoom(), pos.lat)
      q.setFromAxisAngle(up, Math.PI - (headingDeg * Math.PI) / 180)
      holder.matrix.compose(new THREE.Vector3(0, 0, 0), q, new THREE.Vector3(h, h, h))
      body.position.y = bobAmount(now)
      map.triggerRepaint()
    },
  }
}
