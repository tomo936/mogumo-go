// 自分の位置に、3D の男の子（骨組みと動きのある GLB）を立てる。店の模型と同じ地図の3D層を使う。
// 大きさは地図の上で固定（引けば小さく、寄れば大きく）。動きは速さで 待機・歩き・走り、窓口 express('happy') でうれしい。
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { threeLayer } from '../../lib/threeLayer.ts'
import { AVATAR_FADE_S, AVATAR_JOY_PLAYS } from '../config.ts'
import {
  BLINK_TOTAL_MS, FACE_HAPPY, avatarHeightMeters, blinkFrame, initialMotion, joyDurationMs, nextBlinkDelay, playbackRate, stepMotion,
} from '../domain/avatar3d.ts'
import type { FaceFrame, MotionState } from '../domain/avatar3d.ts'
import type { LatLng } from '../domain/geo.ts'

// 使うキャラだけ遅れて読む（URL だけ持ち、ファイルは読み込むときに取りに行く）
const AVATARS = import.meta.glob<string>('../../assets/characters/*/avatar.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const CHARACTER_ID = 101 // 今は全員、男の子

export type Expression = 'happy'

export function createAvatarModel(map: MapLibreMap) {
  const holder = new THREE.Group() // 位置・向き・大きさ（シーンの原点＝自分の位置、単位は m）。模型は身長 1
  holder.matrixAutoUpdate = false
  let ready = false
  let pose: { pos: LatLng } | null = null

  let mixer: THREE.AnimationMixer | null = null
  const actions = new Map<string, THREE.AnimationAction>()
  let face: THREE.Texture | null = null
  let motion: MotionState = initialMotion
  let playing: THREE.AnimationAction | null = null // 今いちばん前に出している動き
  let joyUntil: number | null = null // うれしいが終わる時刻（performance.now の ms）
  let joyWanted = false // 読み込み前に呼ばれた分は捨てる（遅れて喜ばない）
  let blinkAt: number | null = null // 次のまばたきを始める時刻
  let blinkStart: number | null = null

  const fadeTo = (next: THREE.AnimationAction | undefined) => {
    if (!next || next === playing) return
    next.reset().setEffectiveWeight(1).fadeIn(AVATAR_FADE_S).play()
    playing?.fadeOut(AVATAR_FADE_S)
    playing = next
  }

  const setFace = (f: FaceFrame) => {
    if (face && face.offset.x !== f / 4) face.offset.x = f / 4
  }

  const layer = threeLayer({
    id: 'me-avatar-3d',
    onAdd(scene) {
      scene.add(new THREE.HemisphereLight('#ffffff', '#e6dccf', 2.2))
      const sun = new THREE.DirectionalLight('#fff2e4', 2.4)
      sun.position.set(-0.6, 0.8, 0.55)
      scene.add(sun)
      scene.add(holder)
      const url = AVATARS[`../../assets/characters/${CHARACTER_ID}/avatar.glb`]
      if (!url) return
      new GLTFLoader()
        .loadAsync(url)
        .then((gltf) => {
          gltf.scene.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (!mesh.isMesh) return
            mesh.frustumCulled = false // 骨で動く形は、元の箱のままだと画面の端で消えることがある
            for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              const std = m as THREE.MeshStandardMaterial
              std.envMapIntensity = 0 // 店の模型と同じマットな見た目
              // ファイルに金属っぽさの値が無いと、glTF の決まりで「金属（1）」になり、映す景色が無いので真っ黒になる。
              // 布や肌なので、金属っぽさ 0 にする（2026-11-10 黒く見えた原因）。粗さはファイルの値（0.9）のまま
              std.metalness = 0
              if (std.map) {
                std.map.colorSpace = THREE.SRGBColorSpace
                std.map.anisotropy = 8 // 撮影ページと同じ（端末の上限を超える分は three が抑える）
              }
              if (std.name === 'face') face = std.map
            }
          })
          holder.add(gltf.scene)
          mixer = new THREE.AnimationMixer(gltf.scene)
          for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip))
          const joy = actions.get('joy')
          if (joy) {
            joy.setLoop(THREE.LoopRepeat, AVATAR_JOY_PLAYS)
            joy.clampWhenFinished = true // 2 回目の終わりの形のまま、戻りの混ぜを待つ
          }
          playing = actions.get('idle') ?? null
          playing?.play()
          ready = true
          map.triggerRepaint()
        })
        .catch(() => {}) // 読めなければ 2D の男の子のまま
    },
    onRemove() {
      mixer?.stopAllAction()
      holder.clear()
      mixer = null
      actions.clear()
      face = null
      playing = null
      ready = false
    },
    origin: () => pose?.pos ?? null,
  })

  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const zero = new THREE.Vector3()
  const scale = new THREE.Vector3()
  return {
    layer,
    ready: () => ready,
    // 毎コマ（止まっていても）。heading は進む向き（北0・時計回りの度）。正面は模型の +z。speed は m/秒、now は ms
    update(pos: LatLng, headingDeg: number, speedMps: number, dtMs: number, now: number) {
      pose = { pos }
      const h = avatarHeightMeters(map.getZoom(), pos.lat)
      q.setFromAxisAngle(up, Math.PI - (headingDeg * Math.PI) / 180)
      holder.matrix.compose(zero, q, scale.set(h, h, h))
      motion = stepMotion(motion, speedMps, dtMs)
      if (mixer) {
        if (joyWanted) {
          joyWanted = false
          const joy = actions.get('joy')
          if (joy) {
            if (playing === joy) joy.reset().play() // 喜んでいる最中にもう一度: 頭から
            else fadeTo(joy)
            joyUntil = now + joyDurationMs(joy.getClip().duration, AVATAR_JOY_PLAYS)
          }
        }
        if (joyUntil !== null && now >= joyUntil) joyUntil = null
        if (joyUntil === null) fadeTo(actions.get(motion.shown))
        for (const m of ['walk', 'run'] as const) actions.get(m)?.setEffectiveTimeScale(playbackRate(m, speedMps))
        mixer.update(Math.min(dtMs, 100) / 1000) // 裏に回って戻った直後の大きな飛びは詰める
        // 顔: うれしいの間はうれしい顔（まばたきしない）。ほかは 2〜6 秒ごとに自動でまばたき
        if (joyUntil !== null) {
          setFace(FACE_HAPPY)
          blinkStart = null
          blinkAt = null
        } else {
          if (blinkAt === null) blinkAt = now + nextBlinkDelay(Math.random())
          if (blinkStart === null && now >= blinkAt) blinkStart = now
          if (blinkStart !== null && now - blinkStart >= BLINK_TOTAL_MS) {
            blinkStart = null
            blinkAt = now + nextBlinkDelay(Math.random())
          }
          setFace(blinkStart === null ? 0 : blinkFrame(now - blinkStart))
        }
      }
      map.triggerRepaint()
    },
    // 表情の窓口。'happy' = うれしいの動き（0.8 秒 × 2 回）＋うれしい顔。そのあと今の速さの動きへ戻る
    express(kind: Expression) {
      if (kind === 'happy' && ready) joyWanted = true
    },
  }
}
