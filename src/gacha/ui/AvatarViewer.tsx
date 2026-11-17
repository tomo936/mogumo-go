// キャラ一覧の上の大きな表示（A15）。3D があるキャラは、待機の動きでゆっくり回り、指でなぞると向きが変わる。
// WebGL が使えない・読めないときは fallback（原画）を出す
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { avatarModelUrl, prepareAvatarScene } from '../../map/infra/avatarModel.ts'
import { BLINK_TOTAL_MS, blinkFrame, nextBlinkDelay } from '../../map/domain/avatar3d.ts'

type Props = { id: number; fallback: ReactNode }

const SPIN = 0.5 // ひとりでに回る速さ（rad/秒）
const RESUME_MS = 2500 // 指を離してから、また回り出すまで

export function AvatarViewer({ id, fallback }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = box.current
    const url = avatarModelUrl(id)
    if (!el || !url) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    let alive = true
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 50)
    scene.add(new THREE.HemisphereLight('#ffffff', '#e6dccf', 2.2))
    const sun = new THREE.DirectionalLight('#fff2e4', 2.4)
    sun.position.set(-0.6, 0.9, 1.2)
    scene.add(sun)
    const turn = new THREE.Group()
    scene.add(turn)

    let mixer: THREE.AnimationMixer | null = null
    let face: THREE.Texture | null = null
    let angle = -0.35 // 少し斜めから始める
    let dragX: number | null = null
    let lastDrag = -Infinity
    let blinkAt = performance.now() + nextBlinkDelay(Math.random())
    let blinkStart: number | null = null

    const fit = () => {
      const w = el.clientWidth || 1
      const h = el.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)

    new GLTFLoader()
      .loadAsync(url)
      .then((gltf) => {
        if (!alive) return
        face = prepareAvatarScene(gltf.scene)
        // 模型の大きさに合わせて、全身が入るようカメラを置く
        const b = new THREE.Box3().setFromObject(gltf.scene)
        const size = b.getSize(new THREE.Vector3())
        const center = b.getCenter(new THREE.Vector3())
        gltf.scene.position.sub(new THREE.Vector3(center.x, b.min.y, center.z))
        turn.add(gltf.scene)
        const dist = (size.y * 0.7) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
        camera.position.set(0, size.y * 0.62, dist)
        camera.lookAt(0, size.y * 0.5, 0)
        mixer = new THREE.AnimationMixer(gltf.scene)
        const idle = gltf.animations.find((a) => a.name === 'idle')
        if (idle) mixer.clipAction(idle).play()
        setReady(true)
      })
      .catch(() => alive && setFailed(true))

    let prev = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(now - prev, 100) / 1000
      prev = now
      if (dragX === null && now - lastDrag > RESUME_MS) angle += SPIN * dt
      turn.rotation.y = angle
      mixer?.update(dt)
      if (face) {
        if (blinkStart === null && now >= blinkAt) blinkStart = now
        if (blinkStart !== null && now - blinkStart >= BLINK_TOTAL_MS) {
          blinkStart = null
          blinkAt = now + nextBlinkDelay(Math.random())
        }
        face.offset.x = (blinkStart === null ? 0 : blinkFrame(now - blinkStart)) / 4
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const down = (e: PointerEvent) => {
      dragX = e.clientX
      renderer.domElement.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (dragX === null) return
      angle += (e.clientX - dragX) * 0.012
      dragX = e.clientX
    }
    const up = () => {
      dragX = null
      lastDrag = performance.now()
    }
    const c = renderer.domElement
    c.style.touchAction = 'pan-y' // 縦のスクロールは一覧に任せる
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointercancel', up)
      mixer?.stopAllAction()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.geometry.dispose()
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          ;(mat as THREE.MeshStandardMaterial).map?.dispose()
          mat.dispose()
        }
      })
      renderer.dispose()
      c.remove()
    }
  }, [id])

  if (failed || !avatarModelUrl(id)) return <>{fallback}</>
  return (
    <div className="av3d" ref={box} aria-label="3D のキャラ。指でなぞると向きが変わります">
      {!ready && fallback}
    </div>
  )
}
