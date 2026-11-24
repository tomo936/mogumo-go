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

// 距離の霧（2026-11-24。遠くの地面を霞に溶かす霧の輪と同じ色・距離で、3D の模型も霞に溶かす）。
// three の霧はふつう「カメラから見た奥行き」で効くが、ここのカメラは地図の行列を丸ごと projection に入れていて、
// その奥行きが取れない。そこで霧の奥行きを、画面に写したあとの w（＝カメラからの奥行き。地図の単位）にする。
// 霧の near/far も同じ単位で、地図（MapView）が毎コマ入れる。霧は常にかけたまま（切り替えるとシェーダーを作り直して引っかかる）、
// 効かせないときは near/far をとても遠くにする
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
	vFogDepth = gl_Position.w;
#endif`
const mapFog = new THREE.Fog(0xdff0f8, 1e12, 2e12)
export function setMapFog(f: { color: string; near: number; far: number } | null) {
  if (!f) {
    mapFog.near = 1e12
    mapFog.far = 2e12
    return
  }
  mapFog.color.set(f.color)
  mapFog.near = f.near
  mapFog.far = f.far
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

// projectAt が使える状態か（一度でも 3D を描いたか）。?debug の表示用
export const hasProjection = () => lastMatrix !== null

type Options = {
  id: string
  onAdd(scene: THREE.Scene, map: MapLibreMap): void
  onRemove(): void
  origin(): LatLng | null // 描くものが無いときは null
}

// 試作どおり、レイヤーごとに MapLibre の GL を共有するレンダラーを1つ持つ
export type HitLayer = CustomLayerInterface & {
  // 画面の点から真っすぐ見た先で、いちばん手前に当たる物（無ければ null）。distance は m（層をまたいで比べられる）
  hit(tap: { x: number; y: number }): THREE.Intersection | null
}
export function threeLayer(opts: Options): HitLayer {
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
  scene.fog = mapFog
  const proj = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  const raycaster = new THREE.Raycaster()
  const inv = new THREE.Matrix4()
  return {
    id: opts.id,
    hit(tap) {
      const origin = opts.origin()
      if (!map || !lastMatrix || !origin) return null
      const c = map.getCanvas()
      if (!c.clientWidth || !c.clientHeight) return null
      // render() と同じ行列の逆で、画面の点を奥行き 0（手前）と 1（奥）の 2 点に戻して、1 本の線にする
      local.fromArray(modelMatrix(origin, origin, 1, 0))
      inv.fromArray(lastMatrix).multiply(local).invert()
      const nx = (tap.x / c.clientWidth) * 2 - 1
      const ny = 1 - (tap.y / c.clientHeight) * 2
      const near = new THREE.Vector3(nx, ny, -1).applyMatrix4(inv)
      const far = new THREE.Vector3(nx, ny, 1).applyMatrix4(inv)
      raycaster.set(near, far.sub(near).normalize())
      return raycaster.intersectObjects(scene.children, true)[0] ?? null
    },
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

