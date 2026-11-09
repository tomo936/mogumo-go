// MapLibre のカスタムレイヤーに three で描く共通の部品。
// シーンの中は origin を原点にした m（x=東、y=上、z=南）。地図への置き方は modelMatrix で決める。
import * as THREE from 'three'
import { MercatorCoordinate } from 'maplibre-gl'
import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import type { LatLng } from '../map/domain/geo.ts'

// p にモデルを置く行列（three の Matrix4 の配列）。1m の大きさは origin で測る
export function modelMatrix(origin: LatLng, p: { lat: number; lng: number }, scale: number, rotRad: number): number[] {
  const mc = MercatorCoordinate.fromLngLat([p.lng, p.lat], 0)
  const s = MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0).meterInMercatorCoordinateUnits() * scale
  return new THREE.Matrix4()
    .makeTranslation(mc.x, mc.y, mc.z)
    .scale(new THREE.Vector3(s, -s, s))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeRotationY(rotRad))
    .toArray()
}

// 最後に描いたコマのカメラ（メルカトル座標 → 画面のクリップ座標）。地図の上に重ねる HTML のピンを、
// 3D の屋根の高さにぴったり合わせるのに使う（画面の真上にずらすだけだと、遠近で傾いた分がずれる）
let lastMatrix: number[] | null = null

// p の地面から heightM 上の点が、画面（CSS px）のどこに写るか。まだ一度も描いていなければ null
export function projectAt(map: MapLibreMap, p: { lat: number; lng: number }, heightM: number): { x: number; y: number } | null {
  if (!lastMatrix) return null
  const mc = MercatorCoordinate.fromLngLat([p.lng, p.lat], heightM)
  const v = new THREE.Vector4(mc.x, mc.y, mc.z, 1).applyMatrix4(new THREE.Matrix4().fromArray(lastMatrix))
  if (v.w <= 0) return null
  const c = map.getCanvas()
  return { x: ((v.x / v.w + 1) / 2) * c.clientWidth, y: ((1 - v.y / v.w) / 2) * c.clientHeight }
}

type Options = {
  id: string
  onAdd(scene: THREE.Scene, map: MapLibreMap): void
  onRemove(): void
  origin(): LatLng | null // 描くものが無いときは null
}

// 試作どおり、レイヤーごとに MapLibre の GL を共有するレンダラーを1つ持つ
export function threeLayer(opts: Options): CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null
  let map: MapLibreMap | null = null
  let ctx: WebGLRenderingContext | WebGL2RenderingContext | null = null
  // 地図の canvas の大きさが変わったら、three の描く範囲も合わせる（回転・アドレスバーの出入りなど）。
  // 'resize' は地図が canvas を作り直した直後で、次のコマで全部描き直すので、ここで合わせてよい
  const onResize = () => {
    if (renderer && ctx) renderer.setSize(ctx.drawingBufferWidth, ctx.drawingBufferHeight, false)
  }
  const camera = new THREE.Camera()
  const scene = new THREE.Scene()
  const proj = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  return {
    id: opts.id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m
      ctx = gl
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      m.on('resize', onResize)
      opts.onAdd(scene, m)
    },
    onRemove() {
      map?.off('resize', onResize)
      map = null
      ctx = null
      opts.onRemove()
      renderer?.dispose()
      renderer = null
    },
    render(_gl, args) {
      lastMatrix = args.defaultProjectionData.mainMatrix as unknown as number[]
      const origin = opts.origin()
      if (!renderer || !origin) return
      local.fromArray(modelMatrix(origin, origin, 1, 0))
      camera.projectionMatrix = proj.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local)
      renderer.resetState()
      renderer.render(scene, camera)
    },
  }
}

