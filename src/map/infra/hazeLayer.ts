// 遠くの地面を霞に溶かす霧（2026-11-24 オーナー「地面が途中で切れる違和感をなくして」）。
// 主人公（地図の真ん中）を中心に、地面の上に輪っかを敷く。内側は透明、外へ行くほど霞の色が濃くなり、描画距離の境目で空の地平線の色そのものになる。
// 3D の中にあるので、手前の建物・模型は霧より前に描かれ、かすまない（前は画面の上に幕を重ねていて、手前までかすんでいた）
import * as THREE from 'three'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { threeLayer } from '../../lib/threeLayer.ts'
import type { LatLng } from '../domain/geo.ts'

export const HAZE_LAYER = 'haze'

export function createHazeLayer(opts: { active: () => boolean; drawM: () => number; color: () => string }) {
  let map: MapLibreMap | null = null
  let mesh: THREE.Mesh | null = null
  const uniforms = {
    color: { value: new THREE.Color('#dff0f8') },
    inner: { value: 200 }, // ここから霞が始まる（m）
    outer: { value: 500 }, // ここで霞が濃さ 1（m）
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vXZ;
      void main() {
        vXZ = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float inner;
      uniform float outer;
      varying vec2 vXZ;
      void main() {
        float d = length(vXZ);
        float a = smoothstep(inner, outer, d);
        gl_FragColor = vec4(color, a);
      }`,
  })
  return threeLayer({
    id: HAZE_LAYER,
    onAdd(scene, m) {
      map = m
      // 半径 1 の円板（中心を含む）。大きさは描くたびに描画距離に合わせる
      const geo = new THREE.CircleGeometry(1, 96)
      geo.rotateX(-Math.PI / 2) // 地面（x=東・z=南）に寝かせる
      mesh = new THREE.Mesh(geo, material)
      mesh.position.y = 0.3 // 地面の絵より少しだけ上
      mesh.renderOrder = 10
      scene.add(mesh)
    },
    onRemove() {
      mesh?.geometry.dispose()
      material.dispose()
      mesh = null
      map = null
    },
    origin(): LatLng | null {
      if (!map || !mesh || !opts.active()) return null
      const r = opts.drawM()
      uniforms.inner.value = r * 0.42
      uniforms.outer.value = r * 0.98
      uniforms.color.value.set(opts.color())
      mesh.scale.set(r * 1.6, 1, r * 1.6) // 境目の外まで覆う（遠い面で切れる）
      const c = map.getCenter()
      return { lat: c.lat, lng: c.lng }
    },
  })
}
