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

type Options = {
  id: string
  onAdd(scene: THREE.Scene, map: MapLibreMap): void
  onRemove(): void
  origin(): LatLng | null // 描くものが無いときは null
}

// 試作どおり、レイヤーごとに MapLibre の GL を共有するレンダラーを1つ持つ
export function threeLayer(opts: Options): CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null
  const camera = new THREE.Camera()
  const scene = new THREE.Scene()
  const proj = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  return {
    id: opts.id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      opts.onAdd(scene, map)
    },
    onRemove() {
      opts.onRemove()
      renderer?.dispose()
      renderer = null
    },
    render(_gl, args) {
      const origin = opts.origin()
      if (!renderer || !origin) return
      local.fromArray(modelMatrix(origin, origin, 1, 0))
      camera.projectionMatrix = proj.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local)
      renderer.resetState()
      renderer.render(scene, camera)
    },
  }
}

