// 夜の 3D の見た目（A14）: 月明かりの光・窓や提灯の光を強める・お店の足元の暖かい光のたまり。
// お店・施設・アバターの three の層で共通に使う。
import * as THREE from 'three'

// 空の光＋太陽（昼）／月明かり（夜）
// nightHemi: 夜の空の光の強さ（アバターは見やすいよう少し明るくする）
export function makeLights(scene: THREE.Scene, night: boolean, nightHemi = 1.1) {
  const hemi = new THREE.HemisphereLight()
  const sun = new THREE.DirectionalLight()
  sun.position.set(-0.6, 0.8, 0.55)
  scene.add(hemi, sun)
  const apply = (n: boolean) => {
    if (n) {
      hemi.color.set('#8d9ad8')
      hemi.groundColor.set('#2b2747')
      hemi.intensity = nightHemi
      sun.color.set('#b9c6ff')
      sun.intensity = 0.9
    } else {
      hemi.color.set('#ffffff')
      hemi.groundColor.set('#e6dccf')
      hemi.intensity = 2.2
      sun.color.set('#fff2e4')
      sun.intensity = 2.4
    }
  }
  apply(night)
  return { apply }
}

const EMISSIVE_NIGHT = 3.2 // 夜の窓・提灯の光り方（昼は模型のまま）
const base = new WeakMap<THREE.Material, number>()

// 模型の中で、もともと光る材質（窓・提灯など）だけを夜に強くする
export function lightUp(mats: THREE.Material[], night: boolean) {
  for (const m of mats) {
    const s = m as THREE.MeshStandardMaterial
    if (!s.emissive || s.emissive.getHex() === 0) continue
    if (!base.has(m)) base.set(m, s.emissiveIntensity)
    s.emissiveIntensity = night ? EMISSIVE_NIGHT : base.get(m)!
  }
}

let glowTex: THREE.Texture | null = null
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}

// お店の足元に置く光のたまり（地面に平らな丸。足し算で明るくする）
export const GLOW_SCALE = 3.0 // お店の幅の何倍の丸か
export function glowMesh(count: number): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(1, 1)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: '#ffb260',
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.renderOrder = -1
  return mesh
}
