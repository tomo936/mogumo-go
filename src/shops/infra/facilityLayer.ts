// 大型施設: 地図の実際の輪郭を立ち上げて、シロの見本（facility-large.png）の色で描く。
// 壁はクリームに階ごとの窓の帯、屋根のふちは木色、入口に赤白しまのひさし、屋根に植木と室外機。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { localFrame } from '../../map/domain/geo.ts'
import type { LatLng, P } from '../../map/domain/geo.ts'
import { threeLayer } from '../../lib/threeLayer.ts'
import { FACILITY_FLOOR_M } from '../config.ts'
import { outerEdges } from '../domain/facility.ts'
import { pickFacility } from './facilityPick.ts'
import type { PlacedFacility } from './facilityPick.ts'
import { screenScale } from './screenScale.ts'

const WALL = '#f6ead7'
const ROOF = '#eedcbc'
const WINDOW = '#91cfe7'
const WOOD = '#8e5c42'
const WOOD_L = '#b7a08a'
const RED = '#e4745f'
const BAY_M = 2.5 // 窓1つぶんの横幅
const RIM_M = 0.5 // 屋根のふちの太さ

// 駅（シロの見本 art/reference/shops/station-shape-1〜3）: 明るいグレーの壁、屋根のふちに緑の帯（2段）、
// 木枠の縦長の窓を等間隔、入口に赤白しまの丸いひさしと丸時計
const ST_WALL = '#dcd8d1'
const ST_LEDGE = '#cbc6bd'
const ST_ROOF = '#ece6da'
const ST_RIM = '#6faf62'
const ST_FRAME = '#d39a5c'
const ST_GLASS = '#bcdfee'

// 窓の帯の絵（1枚 = 横 BAY_M × 縦 1階）。くり返して壁に貼る。駅は縦長の窓
function wallTexture(station = false): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 90
  const g = c.getContext('2d')!
  g.fillStyle = station ? ST_WALL : WALL
  g.fillRect(0, 0, 64, 90)
  if (station) {
    g.fillStyle = ST_LEDGE // 階ごとのでっぱり
    g.fillRect(0, 84, 64, 6)
    g.fillStyle = ST_FRAME
    g.fillRect(21, 16, 22, 60)
    g.fillStyle = ST_GLASS
    g.fillRect(25, 20, 14, 52)
    g.fillStyle = 'rgba(255,255,255,0.5)'
    g.fillRect(27, 22, 4, 46)
  } else {
    g.fillStyle = WOOD_L
    g.fillRect(8, 22, 48, 44)
    g.fillStyle = WINDOW
    g.fillRect(12, 26, 40, 36)
    g.fillStyle = 'rgba(255,255,255,0.45)'
    g.fillRect(14, 28, 10, 32)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / BAY_M, 1 / FACILITY_FLOOR_M)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// 赤白しまのひさしの絵
function stripeTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 8
  const g = c.getContext('2d')!
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : RED
    g.fillRect(i * 8, 0, 8, 8)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 })

function contains(p: P, ring: P[]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

// m（x=東, y=北）の点を three のシーン（x=東, y=上, z=南）へ
const at = (p: P, up: number) => new THREE.Vector3(p.x, up, -p.y)

export function createFacilityLayer(): CustomLayerInterface & {
  setFacilities(list: PlacedFacility[]): void
  pick(point: { x: number; y: number }): string[] | null
} {
  let scene: THREE.Scene | null = null
  let map: MapLibreMap | null = null
  let list: PlacedFacility[] = []
  let origin: LatLng | null = null
  let objects: THREE.Object3D[] = []
  const geos: THREE.BufferGeometry[] = []
  type Mats = { wall: THREE.Material; roof: THREE.Material; wood: THREE.Material; awning: THREE.Material; green: THREE.Material; metal: THREE.Material; face: THREE.Material; ring: THREE.Material }
  let mats: Mats | null = null
  let stMats: Pick<Mats, 'wall' | 'roof' | 'wood'> | null = null

  const clear = () => {
    for (const o of objects) scene?.remove(o)
    objects = []
    for (const g of geos) g.dispose()
    geos.length = 0
  }

  const add = (geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) => {
    geos.push(geo)
    const mesh = new THREE.Mesh(geo, m)
    scene!.add(mesh)
    objects.push(mesh)
  }

  const build = () => {
    clear()
    if (!scene || !origin || !mats || !stMats) return
    const frame = localFrame(origin)
    for (const f of list) {
      const m = f.kind === 'station' ? stMats : mats
      const rims: THREE.BufferGeometry[] = []
      const parts = f.parts.map((part) => ({ pts: part.ring.map((q) => frame.to(q)), heightM: part.heightM }))
      for (const part of parts) {
        const shape = new THREE.Shape(part.pts.map((p) => new THREE.Vector2(p.x, p.y)))
        const body = new THREE.ExtrudeGeometry(shape, { depth: part.heightM, bevelEnabled: false })
        body.rotateX(-Math.PI / 2) // 形の面を地面へ（y=北 → z=南、押し出し → 上）
        add(body, [m.roof, m.wall])
      }
      // 屋根のふち: 外側の辺だけ（つなぎ目に線を出さない）
      for (const { a, b, heightM } of outerEdges(parts)) {
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        if (len < 0.3) continue
        const box = new THREE.BoxGeometry(len + RIM_M, RIM_M, RIM_M)
        box.rotateY(Math.atan2(b.y - a.y, b.x - a.x))
        box.translate((a.x + b.x) / 2, heightM + RIM_M / 2, -(a.y + b.y) / 2)
        rims.push(box)
        if (f.kind === 'station') {
          // 駅は緑の帯を2段（見本どおり、少し下にもう1本）
          const band = new THREE.BoxGeometry(len + RIM_M, RIM_M * 0.6, RIM_M * 1.2)
          band.rotateY(Math.atan2(b.y - a.y, b.x - a.x))
          band.translate((a.x + b.x) / 2, heightM - RIM_M * 0.8, -(a.y + b.y) / 2)
          rims.push(band)
        }
      }
      if (rims.length) {
        const merged = mergeGeometries(rims)
        for (const r of rims) r.dispose()
        if (merged) add(merged, m.wood)
      }
      // 入口の赤白しまのひさし（正面の辺の真ん中、高さ 3m）
      const door = frame.to(f.door)
      const rot = (f.facingDeg * Math.PI) / 180
      const out = { x: Math.sin(rot), y: Math.cos(rot) }
      if (f.kind === 'station') {
        // 駅: 半円の丸いひさし（赤白しま）と、その上の丸時計。+z（南）向きに作って正面へ回す
        const turn = Math.atan2(out.x, -out.y)
        const dome = new THREE.SphereGeometry(2, 16, 8, 0, Math.PI, 0, Math.PI / 2)
        dome.scale(1, 0.8, 0.9)
        dome.rotateY(turn)
        const d = at(door, 3)
        dome.translate(d.x, d.y, d.z)
        add(dome, mats.awning)
        const top = Math.min(f.parts[0].heightM - 1.6, 6)
        const k = at({ x: door.x + out.x * 0.15, y: door.y + out.y * 0.15 }, top)
        const face = new THREE.CircleGeometry(1, 24)
        face.rotateY(turn)
        face.translate(k.x, k.y, k.z)
        add(face, mats.face)
        const ring = new THREE.TorusGeometry(1, 0.18, 8, 24)
        ring.rotateY(turn)
        ring.translate(k.x, k.y, k.z)
        add(ring, mats.ring)
      } else {
        const awning = new THREE.BoxGeometry(5, 0.15, 1.6)
        awning.rotateX(0.35)
        awning.rotateY(-rot)
        const c = at({ x: door.x + out.x * 0.8, y: door.y + out.y * 0.8 }, 3.2)
        awning.translate(c.x, c.y, c.z)
        add(awning, mats.awning)
      }
      // 屋根の小物（main の真ん中が輪郭の中なら、植木と室外機）
      const main = f.parts[0]
      const pts = main.ring.map((q) => frame.to(q))
      const mid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
      if (contains(mid, pts)) {
        const bush = new THREE.SphereGeometry(1.2, 12, 8)
        const b = at({ x: mid.x - 2, y: mid.y }, main.heightM + 1)
        bush.translate(b.x, b.y, b.z)
        add(bush, mats.green)
        const ac = new THREE.BoxGeometry(1.6, 1.1, 1.2)
        const a = at({ x: mid.x + 2.5, y: mid.y + 1 }, main.heightM + 0.55)
        ac.translate(a.x, a.y, a.z)
        add(ac, mats.metal)
      }
    }
    map?.triggerRepaint()
  }

  const layer = threeLayer({
    id: 'facilities-3d',
    onAdd(sc, mp) {
      scene = sc
      map = mp
      sc.add(new THREE.HemisphereLight('#ffffff', '#e6dccf', 2.2))
      const sun = new THREE.DirectionalLight('#fff2e4', 2.4)
      sun.position.set(-0.6, 0.8, 0.55)
      sc.add(sun)
      const wall = mat(WALL)
      wall.map = wallTexture()
      const awning = mat('#ffffff')
      awning.map = stripeTexture()
      mats = { wall, roof: mat(ROOF), wood: mat(WOOD), awning, green: mat('#7aa45e'), metal: mat('#a9b4c2'), face: mat('#fffdf7'), ring: mat(WOOD) }
      const stWall = mat(ST_WALL)
      stWall.map = wallTexture(true)
      stMats = { wall: stWall, roof: mat(ST_ROOF), wood: mat(ST_RIM) }
      build()
    },
    onRemove() {
      clear()
      for (const set of [mats, stMats]) if (set) for (const m of Object.values(set)) {
        ;(m as THREE.MeshStandardMaterial).map?.dispose()
        m.dispose()
      }
      mats = null
      stMats = null
      scene = null
      map = null
    },
    origin: () => (objects.length ? origin : null),
  })

  return {
    ...layer,
    setFacilities(next) {
      list = next
      origin = next.length ? next[0].door : null
      build()
    },
    // 画面の点で押された施設の店の id（全員）
    pick(point) {
      if (!map) return null
      const m = map
      const project = (p: { lat: number; lng: number }) => m.project([p.lng, p.lat])
      const hit = pickFacility(list, point, project, (f, heightM) => heightM * screenScale(project, f.door).pxPerUpM)
      return hit?.shopIds ?? null
    },
  }
}
