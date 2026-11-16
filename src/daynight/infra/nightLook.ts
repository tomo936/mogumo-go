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
const GLASS_NIGHT = '#ffd08a' // 夜のガラス窓: 中の明かりがついた暖かい黄色
const GLASS_NIGHT_INTENSITY = 1.4
const base = new WeakMap<THREE.Material, number>()

// 水色の明るい材質 = ガラス窓（光る窓を持たない模型（ラーメン・ベーカリー・洋食）は窓がこれ）
const hsl = { h: 0, s: 0, l: 0 }
function isGlass(m: THREE.MeshStandardMaterial): boolean {
  if (!m.color) return false
  m.color.getHSL(hsl, THREE.SRGBColorSpace)
  return hsl.h > 0.5 && hsl.h < 0.7 && hsl.l > 0.7 && hsl.s > 0.2
}

// 夜は、もともと光る材質（窓・提灯）を強く、ガラス窓に中の明かりをつける。昼は模型のまま。
// 地面に光の丸を置くやり方は、点々のちらつきと重さが出たのでやめた（2026-11-17 オーナー）
export function lightUp(mats: THREE.Material[], night: boolean) {
  for (const m of mats) {
    const s = m as THREE.MeshStandardMaterial
    if (!s.emissive) continue
    if (!s.userData.glass && (base.has(m) || s.emissive.getHex() !== 0)) {
      if (!base.has(m)) base.set(m, s.emissiveIntensity)
      s.emissiveIntensity = night ? EMISSIVE_NIGHT : base.get(m)!
    } else if (s.userData.glass || isGlass(s)) {
      s.userData.glass = true // 一度ガラスと決めたら、夜に光らせたあとも同じ扱い
      s.emissive.set(night ? GLASS_NIGHT : '#000000')
      s.emissiveIntensity = night ? GLASS_NIGHT_INTENSITY : 1
    }
  }
}

// お店の足元に置く光のたまり（地面に平らな四角に、真ん中ほど明るい丸を計算で描く。足し算で重ねる）。
// 絵（テクスチャ）は使わない: 地図と描画のしくみを共有しているため、iPhone で地図の側の絵を読んで色つきの点々になった（2026-11-17）
export const GLOW_SCALE = 3.0 // お店の幅の何倍の大きさか（前と同じ）
let glowMat: THREE.ShaderMaterial | null = null
function glowMaterial(): THREE.ShaderMaterial {
  glowMat ??= new THREE.ShaderMaterial({
    uniforms: { u_color: { value: new THREE.Color('#ffb260') } },
    vertexShader: `
      varying vec2 v_uv;
      void main() {
        v_uv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 u_color;
      varying vec2 v_uv;
      void main() {
        float d = length(v_uv - 0.5) * 2.0;
        float a = d < 0.35 ? mix(1.0, 0.55, d / 0.35) : mix(0.55, 0.0, (d - 0.35) / 0.65);
        a = clamp(a, 0.0, 1.0);
        gl_FragColor = vec4(u_color * a, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  return glowMat
}
let glowGeo: THREE.PlaneGeometry | null = null
export function glowMesh(count: number): THREE.InstancedMesh {
  if (!glowGeo) {
    glowGeo = new THREE.PlaneGeometry(1, 1)
    glowGeo.rotateX(-Math.PI / 2)
  }
  const mesh = new THREE.InstancedMesh(glowGeo, glowMaterial(), count)
  mesh.renderOrder = -1
  return mesh
}
