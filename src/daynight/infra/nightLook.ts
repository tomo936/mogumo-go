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
