import type { Map as MapLibreMap } from 'maplibre-gl'
import { FOG_REBUILD_M, THIN_START_M } from '../../fog/config.ts'
import { clearedFromHome, isClearedAt } from '../../fog/domain/clearing.ts'
import { behindFog } from '../../shops/domain/visibility.ts'
import { farClumps, fogClumps } from '../../fog/domain/clumps.ts'
import type { Clump } from '../../fog/domain/clumps.ts'
import { cellKey } from '../../fog/domain/grid.ts'
import type { Cell } from '../../fog/domain/grid.ts'
import { thinAmount, waveClumps } from '../../fog/domain/wave.ts'
import { TOWN_FILL_HALF_M } from '../../towns/config.ts'
import { cellsInTown } from '../../towns/domain/shape.ts'
import type { ClearedTown } from '../../towns/domain/shape.ts'
import { createFogLayer } from '../../fog/infra/fogLayer.ts'
import { BUILDING_MAX_SIZE_M, BUILDING_TOP_RATE, FACILITY_MIN_AREA_M2, FACILITY_NEAR_M, IN_FOG_VISIBLE_M, LAYER_UPDATE_MS, LOD_CAMERA_MIN_ZOOM, LOD_CAMERA_MOVE_M, LOD_MARGIN_M, LOD_MAX_DETAILED, LOD_NEAR_M, MAP_SHOPS_REEXTRACT_M, MAX_SHOP_MODELS, PLACE_BUDGET_MS, SHOP_RADIUS_M, SHOP_REFETCH_M, SHOP_REFRESH_M, SHOP_RETRY_AFTER_FAIL_MS } from '../../shops/config.ts'
import { doorPoint, dropSharedParts, enoughShops, facilityLabel, facilityParts, heightAt, mergeFacilities, ringsOverlap, stationIn } from '../../shops/domain/facility.ts'
import { groupShops } from '../../shops/domain/grouping.ts'
import { capModels, pickDetailed } from '../../shops/domain/lod.ts'
import { mergeShops } from '../../shops/domain/merge.ts'
import { placeShop } from '../../shops/domain/placement.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { modelPlace, visibleShops } from '../../shops/domain/visibility.ts'
import { extractFeatures, featuresNear, NEAR_M, SOURCE as MAP_SOURCE } from '../../shops/infra/mapFeatures.ts'
import type { AreaFeatures } from '../../shops/infra/mapFeatures.ts'
import { extractMapShops } from '../../shops/infra/mapShops.ts'
import { nearBox, tileBox } from '../../shops/domain/tileBox.ts'
import type { TileBox } from '../../shops/domain/tileBox.ts'
import type { Landmark } from '../../shops/infra/mapShops.ts'
import { createDebugOverlay, debugOn } from './debugOverlay.ts'
import { createBuildingPins } from '../../shops/infra/buildingPins.ts'
import { createFacilityLayer } from '../../shops/infra/facilityLayer.ts'
import type { PlacedFacility } from '../../shops/infra/facilityPick.ts'
import type { PinnedBuilding } from '../../shops/infra/buildingPins.ts'
import { createShopPins } from '../../shops/infra/shopPins.ts'
import type { HintPin } from '../../shops/infra/shopPins.ts'
import { clusterFeatures } from '../../shops/domain/cluster.ts'
import { createShopLayer } from '../../shops/infra/shopLayer.ts'
import type { PlacedShop } from '../../shops/infra/shopLayer.ts'
import { retainNear } from '../../shops/domain/retain.ts'
import { distanceMeters, localFrame } from '../domain/geo.ts'
import { MAX_ACCURACY_M } from '../config.ts'
import { watchUserMove } from '../infra/userMove.ts'
import type { LatLng } from '../domain/geo.ts'
import { jstDay } from '../../checkin/domain/day.ts'
import { addVisit, mergeVisits } from '../../checkin/domain/visits.ts'
import type { Visits } from '../../checkin/domain/visits.ts'

type Deps = {
  home: LatLng | null
  fetchHotpepper: (center: LatLng) => Promise<Shop[]>
  shopsEnabled: boolean
  onShopsError: () => void
  loadProgress: () => Promise<{ cells: Cell[]; checkedShopIds: Set<string>; visitsByShop?: Map<string, Visits> }>
  onPinTap: (shopIds: string[]) => void // ビルの上のピンが押された（1軒ならその店、まとめたピンなら全員）
  onShopsReady?: () => void // ホットペッパー・地図のお店・進み具合の3つがそろった最初の1回
  loadTowns?: () => Promise<ClearedTown[]> // クリアした町（形つき）。読めなければ町なしのまま
}

const THIN_EASE_PER_S = 3 // 薄さが目標に近づく速さ（1秒あたり）
const THIN_MAX_SPOTS = 4
const THIN_EPS = 0.01
const THIN_RESCAN_M = 3 // 候補の洗い出しをやり直す移動距離

// 霧（雲の塊）とお店の建物を地図に載せ、位置が変わるたびに更新する
type WorldMap = MapLibreMap

// 自分のアバターと影（MapView で足す）。霧とお店はこれより下に入れる。足元の範囲の塗りと波紋はお店・霧より下（建物の上に乗らないように。2026-11-12 オーナー）
const PLAYER_LAYERS = ['me-avatar-3d', 'me-shadow']

// 輪郭を見分ける文字列（別々の店の座標から戻したので、頂点数と最初の頂点を 1e-5 度に丸めて比べる）
const ringKey = (ring: LatLng[]) => `${ring.length}:${ring[0].lat.toFixed(5)},${ring[0].lng.toFixed(5)}`
// 点が輪郭（緯度経度）の中にあるか
const ringHas = (ring: LatLng[], p: LatLng) => {
  const f = localFrame(p)
  return stationIn([{ pts: ring.map((v) => f.to(v)), heightM: 0 }], [{ x: 0, y: 0 }]) !== null
}

// 店ごとの置き方。輪郭に合わせたときは、同じ建物の店がそろったときのビルの置き方（bldg）も持つ
// facility: 実際の形で立体にする建物（輪郭が FACILITY_MIN_AREA_M2 以上か、駅の点を含むときだけ）
// ring: 店が乗った輪郭（bldg があるときだけ。後から駅の点が見つかったときの置き直し用）
type Placed = {
  main: PlacedShop
  bldg: PlacedShop | null
  areaM2: number
  ring: LatLng[] | null
  facility: { parts: { ring: LatLng[]; heightM: number }[]; door: LatLng; kind: 'facility' | 'station'; name: string | null } | null
}

// 置き方の計算待ちの列と、そのために取り出した道路・建物（p を原点にした m）
type Work = { p: LatLng; frame: ReturnType<typeof localFrame>; area: AreaFeatures | null; queue: Shop[] }

type World = {
  onPosition(p: LatLng): void
  facilityHeightAt(p: LatLng): number // いま立体で出している駅・大型施設の輪郭の中なら、その屋根の高さ（m）。外は 0（アバターが上を歩くため）
  setAccuracy(m: number): void // 最新の測位の誤差（m）。粗い位置で取ったホットペッパーを、正確になったら取り直すため
  shopsNear(): Shop[]
  pick(point: { x: number; y: number }): string[] | null // 押された建物の店の id（ビルなら全員）。ピンが先、次に 3D の模型のうち画面の点から見て一番手前に当たったもの
  pickTarget(point: { x: number; y: number }): { ids: string[]; at: LatLng | null } | null // pick と同じものと、カメラを寄せる先（押した建物の場所。分からなければ null）
  setView(center: LatLng | null): void // カメラが自分から離れて見ている場所（自分を追いかけているときは null）。雲はそこのまわりに置く
  focus(shopIds: string[] | null): void // タップして選んだ店（その建物は必ず詳しい模型）。閉じたら null
  addCleared(cells: Cell[], from: LatLng): void
  addTown(town: ClearedTown, from: LatLng | null): void // 今クリアした町。見えている範囲を波で晴らす（from が null なら現在地から）
  markChecked(shopId: string, mapId?: string | null): void
  titleOf(shopIds: string[]): string | null // 施設・駅の名前（ビルや名前の無い施設は null）
  checked(): ReadonlySet<string> // 済みの店 id（合体した店は、地図の点の id で済みでも含む）
  checkedToday(shop: { id: string; mapId: string | null }): boolean // 今日（日本時間）もうチェックインした店か
  visitsFor(shop: { id: string; mapId: string | null }): Visits | null // わたしの記録（読み込み前・0回は null）
  progressReady(): boolean // 保存済みの記録を読み終えたか
  hintInputs(): { shops: Shop[]; near: Shop[]; cleared: ReadonlySet<string>; checked: ReadonlySet<string> } // 気配の候補集めの材料
  setHintedShops(ids: ReadonlySet<string>): void // 気配の店（正体がまだ分からない店）。その店の1軒ピンは出さない（気配のピンと重なるため）
  setHintPins(pins: readonly HintPin[]): void // 気配の「？」のピン（ほかのピンと同じ層に描く。2026-11-16）
  bounceHint(id: string): void // 気配のピンをぽんと弾ませる
  setPinsVisible(visible: boolean): void // 店のピン（1軒・ビル・施設）と名前の札を出す・出さない（気配のピンは別）
  shopsReady(): boolean // お店の読み込み（3つ）がそろったか
  dispose(): void
}

export function attachWorld(map: WorldMap, deps: Deps): World {
  const cleared = clearedFromHome(deps.home)
  const fogLayer = createFogLayer()
  const shopLayer = createShopLayer('shops-3d') // 晴れた所の店（雲と奥行きを比べる）
  const fogShopLayer = createShopLayer('shops-3d-fog') // 霧の中の近い店（今までどおり雲の上に描く）
  const facilityLayer = createFacilityLayer()
  const shopPins = createShopPins(map) // 1軒の店のピン（symbol レイヤー）
  const buildingPins = createBuildingPins(map, (ids) => deps.onPinTap(ids))
  // 人が地図を動かしている間は、店のピン（1軒・ビル・施設）を隠す。歩いてカメラが自動でついてくる動きでは隠さない
  const stopUserMove = watchUserMove(map, (moving) => {
    shopPins.setMoving(moving)
    buildingPins.setMoving(moving)
  })
  const debugOverlay = debugOn(window.location.search) ? createDebugOverlay(map, buildingPins.debugRows) : null // ?debug のときだけ
  let hintedIds: ReadonlySet<string> = new Set() // 気配の店の id（1軒ピンを隠す）
  let shownPlaced: PlacedShop[] = [] // いま層に渡している置き方（1軒の店だけ。ピン用）
  let shownInFog: ReadonlySet<string> = new Set() // そのうち霧の中の近い店（ピンを雲の上に描く）
  let shownFrom: LatLng | null = null // 距離順（ピンの優先）の基準にした現在地
  let shownBuildings: PinnedBuilding[] = [] // いま出しているビルと、その中の店
  let shownFacilities: PlacedFacility[] = [] // いま出している大型施設・駅
  let fogCenter: LatLng | null = null // 雲の塊を置いたときの原点（ふだんは現在地、離れた所を見ているときはその場所）
  // カメラが自分から離れて見ている場所。近くの雲（晴れたセルを避ける）は原点から FOG_HALF_M までしか置かないので、
  // 図鑑の「地図で見る」などで遠くを見るときは、そこを原点にしないと行った所も晴れていない（2026-11-16 オーナー）
  let view: LatLng | null = null
  // お店を読む・出す範囲の真ん中（見ている場所、無ければ自分）
  const areaNow = (): LatLng | null => view ?? last
  const towns: ClearedTown[] = [] // クリアした町
  let lastClumps: Clump[] = [] // 層に最後に渡した雲の塊（波の「変わる前」）
  const checkedIds = new Set<string>() // サーバーが知っている id と、今回付けた id（hp: と osm: の両方がありうる）
  const visits = new Map<string, Visits>() // 店 id ごとの記録（回数・はじめて・この前、日本時間）
  const visitsFor = (shop: { id: string; mapId: string | null }): Visits | null =>
    mergeVisits(visits.get(shop.id), shop.mapId ? visits.get(shop.mapId) : undefined)
  // 店の id か、合体前の地図の点の id のどちらかが済みなら、その店は済み
  const checkedNow = (): Set<string> => {
    const s = new Set(checkedIds)
    for (const shop of shops) if (shop.mapId && checkedIds.has(shop.mapId)) s.add(shop.id)
    return s
  }
  const thinShown = new Map<string, number>() // 店ごとの、いま見せている薄さ
  let thinSent: { id: string; amount: number }[] | null = null // 層に最後に渡した薄さ
  let lastTickMs: number | null = null
  let thinCands: Shop[] = [] // 薄くする候補（洗い出した近い順の最大4軒）
  const thinFading = new Map<string, Shop>() // 候補から外れた店のうち、晴れたせいで外れたもの。0 へ戻しきるまで残す
  let thinScanAt: LatLng | null = null
  let thinShops: Shop[] | null = null
  let thinClearedSize = -1
  let fetchCenter: LatLng | null = null
  // 起動直後は誤差 2km までの粗い位置でも地図を出すので、その位置を真ん中に半径 1km のホットペッパーを取ると、
  // 正しい位置が分かったあとも 500m 動くまで取り直さず、片側のお店が抜けていた（2026-11-16 オーナー「開き直したら大丈夫」）。
  // 粗い位置で取った分は、正確になったら 1 回だけ取り直す
  let accuracyM = Infinity // まだ分からないときは粗い扱い
  let fetchedCoarse = false
  let fetching = false
  let failedAt: number | null = null
  let disposed = false
  // お店の読み込みがそろったか: ホットペッパー（使えない環境では不要）・地図のお店の取り出し・進み具合
  const ready = { hp: !deps.shopsEnabled, map: false, progress: false, fired: false }
  const PLACE_BUDGET_BEFORE_READY_MS = 40
  const checkReady = () => {
    // 見えるお店を置き終わるまで待つ（置いている途中で地図を出すと、お店が少しずつ増えて「出ていない」ように見える。2026-11-16 オーナー）
    if (ready.fired || disposed || !ready.hp || !ready.map || !ready.progress || work) return
    ready.fired = true
    deps.onShopsReady?.()
  }
  let hpShops: Shop[] = [] // ホットペッパーの最後に成功した結果
  let mapShops: Shop[] = [] // 地図タイルのお店（タイルが読めたときだけ更新）
  let shops: Shop[] = [] // 2つを合わせたもの
  let near: Shop[] = [] // いま層に渡している店（近い順）
  let last: LatLng | null = null
  let shownKey: string | null = null
  const placed = new Map<string, Placed>() // 店ごとの置き方（一度だけ計算）
  let landmarks: Landmark[] = [] // 駅と施設の名前つきの点（地図のお店と一緒に読む）
  const facilityCache: NonNullable<Placed['facility']>[] = [] // 計算済みの施設の形
  const seenStations = new Set<string>() // これまでに読んだ駅の点（名前＋丸めた位置）

  const toPlaced = (shop: Shop, pl: ReturnType<typeof placeShop>): PlacedShop => {
    const c = localFrame(shop).back(pl.center)
    return { id: shop.id, model: shop.kind, shopIds: [shop.id], lat: c.lat, lng: c.lng, facingDeg: pl.facingDeg, sizeM: pl.sizeM }
  }

  let shownVisible: Shop[] = [] // 最後の更新で見えていた店（近い順。置き方が未計算の店も含む）
  let work: Work | null = null // 置き方の計算待ち
  let frameId: number | null = null // 次のコマの予約
  let layerAt = 0 // 最後に層を作り直そうとした時刻（ms）
  let lastDetailed: ReadonlySet<string> = new Set() // 前回詳しい模型で出した物の id
  let focusIds: ReadonlySet<string> = new Set() // タップして選んだ店の id
  let cameraAt: LatLng | null = null // 詳しい模型を選んだときのカメラの真ん中（拡大していないときは null）
  let refreshedAt: LatLng | null = null
  let extractedAt: LatLng | null = null
  // 前に読んだあと、地図のタイルが新しく届いたか。地図のお店は読み込み済みのタイルからしか取れないので、
  // 回したり動かしたりして後から届いたタイルの分も、次の idle で読み直す（2026-11-16 オーナー「たまにお店が全部出ない」）
  let tilesArrived = false
  // 地図のタイルが 1 枚でも届いたか。届く前でも areTilesLoaded は true を返すことがあり、そこで読むと地図のお店が 0 軒のまま
  // 「そろった」になっていた（2026-11-16 実測: 起動 0.25 秒で 0 軒のまま onShopsReady）
  let tilesSeen = false
  // 前に読んだあとに初めて届いたタイルの範囲。そのまわりのお店と施設は、次の読み直しで置き直す
  // （建物がタイルの境目にかかると、先に届いた片方のタイルだけの形で置いたまま残り、コルティがたまに 6 軒→4 軒。2026-11-17 オーナー）
  const tilesKnown = new Set<string>()
  let newTiles: TileBox[] = []
  const refreshShops = (p: LatLng) => {
    refreshedAt = p
    if (!map.areTilesLoaded()) extractedAt = null // 読めなかった回があれば、読めたあとの最初の更新で必ず読み直す
    // 地図のお店の読み直し（取り出しと合体は重い）は、まだ読んでいない・前回から MAP_SHOPS_REEXTRACT_M 以上動いたときだけ（idle は回転のたびに来る）。
    // 見える・見えないの計算は SHOP_REFRESH_M ごとに別でやる
    let freshTiles = false
    if (map.areTilesLoaded() && (!extractedAt || tilesArrived || distanceMeters(extractedAt, p) >= MAP_SHOPS_REEXTRACT_M)) {
      freshTiles = true
      extractedAt = p
      tilesArrived = false
      const lm: Landmark[] = []
      const found = extractMapShops(map, p, SHOP_RADIUS_M, lm)
      // 読めるのは今の画面に入っているタイルの分だけなので、置き換えずに足していく（前に読んだお店は画面の外に移っても残す）。
      // 遠くなったお店・駅の点だけ外す（2026-11-16 オーナー「お店の数激減」: 置き換えていたので回すたびに減っていた）
      const keep = SHOP_RADIUS_M * 1.5
      const byId = new Map(retainNear(mapShops, [p, last], keep).map((m) => [m.id, m])) // 見ている場所と自分の両方のまわりを残す
      for (const m of found) byId.set(m.id, m)
      mapShops = [...byId.values()]
      const lmKey = (m: Landmark) => `${m.kind}:${m.name}@${m.lat.toFixed(5)},${m.lng.toFixed(5)}`
      const lmById = new Map(retainNear(landmarks, [p, last], keep).map((m) => [lmKey(m), m]))
      for (const m of lm) lmById.set(lmKey(m), m)
      landmarks = [...lmById.values()]
      shops = mergeShops(mapShops, hpShops)
      if (tilesSeen) ready.map = true
      if (newTiles.length) {
        const boxes = newTiles
        newTiles = []
        const near = (q: LatLng) => boxes.some((b) => nearBox(q, b, FACILITY_NEAR_M))
        const stale = facilityCache.filter((f) => f.parts.some((q) => q.ring.some(near)))
        for (const f of stale) facilityCache.splice(facilityCache.indexOf(f), 1)
        for (const [id, hit] of placed) {
          if (near(hit.main) || (hit.facility && stale.includes(hit.facility))) {
            placed.delete(id)
            shownKey = null
          }
        }
      }
      // 建物に乗らずに置いたお店は、そこの地図がまだ届いていなかっただけかもしれないので、新しいタイルで置き直す
      // （読めるのは今の画面のタイルだけ。古い置き方を覚えたままで、施設・ビルの数が減っていた。2026-11-16 オーナー「コルティが 6 から 2」）
      for (const [id, hit] of placed) {
        if (!hit.bldg && !hit.facility) {
          placed.delete(id)
          shownKey = null
        }
      }
      // 新しく読めた駅の点があれば、それを含む輪郭の店と施設を置き直す（古い点で計算したままだと駅にならない）
      for (const m of lm) {
        const k = `${m.name}@${m.lat.toFixed(5)},${m.lng.toFixed(5)}`
        if (m.kind !== 'station' || seenStations.has(k)) continue
        seenStations.add(k)
        const stale = facilityCache.filter((f) => f.kind === 'facility' && ringHas(f.parts[0].ring, m))
        for (const f of stale) facilityCache.splice(facilityCache.indexOf(f), 1)
        for (const [id, hit] of placed) {
          if ((hit.ring && ringHas(hit.ring, m)) || (hit.facility && stale.includes(hit.facility))) {
            placed.delete(id)
            shownKey = null
          }
        }
      }
    }
    // 見える店（近い順）。まだ置き方を計算していない店は近い順の列に入れ、1コマ PLACE_BUDGET_MS ずつ計算する
    // （初めての場所や霧が大きく晴れた直後に、数百軒を一度に計算して画面が止まらないように）。最初の分はこの場で計算する
    shownVisible = visibleShops(shops, p, cleared, last ?? p)
    if (!map.areTilesLoaded()) {
      work = null // タイル読み込み中は置かない。idle のときにやり直す
    } else {
      const queue = shownVisible.filter((s) => !placed.has(s.id))
      // 地図から取り出した道路・建物は、列を計算し終えるまで使い回す（動いたら作り直す）
      // 新しいタイルが届いたら、道路・建物も読み直す（古いのを使うと、後から届いた所のお店が建物なしで置かれていた）
      work = work && !freshTiles && distanceMeters(work.p, p) < SHOP_REFRESH_M ? { ...work, queue } : { p, frame: localFrame(p), area: null, queue }
    }
    placeSome()
    showShops(p)
    if (work) nextFrame()
    checkReady()
  }

  // 列の店の置き方を、PLACE_BUDGET_MS まで計算する（最低1軒）。列が空になったら取り出した道路・建物も捨てる
  const placeSome = () => {
    if (!work) return
    const t0 = performance.now()
    while (work.queue.length) {
      const shop = work.queue.shift()!
      if (!placed.has(shop.id)) placeOne(shop, work)
      // そろうまではタイトル画面が地図を隠しているので、1 コマで多めに計算して早く終える（2026-11-16）
      if (performance.now() - t0 >= (ready.fired ? PLACE_BUDGET_MS : PLACE_BUDGET_BEFORE_READY_MS)) break
    }
    if (!work.queue.length) work = null
  }

  // 次のコマで続きを計算する。層の作り直しは LAYER_UPDATE_MS ごとと、列が空になったときだけ（毎コマ作り直すと重い）
  const nextFrame = () => {
    if (frameId !== null || disposed) return
    frameId = requestAnimationFrame(() => {
      frameId = null
      if (disposed) return
      placeSome()
      if (refreshedAt && (!work || performance.now() - layerAt >= LAYER_UPDATE_MS)) showShops(refreshedAt)
      if (work) nextFrame()
      else checkReady()
    })
  }

  // 1軒の店の置き方（道路向き・建物の輪郭に合わせる）と、大型施設・駅の形を計算して覚える
  const placeOne = (shop: Shop, w: Work) => {
    // タイルは1回の列で1回だけ読む（店ごとに読むと、店の数×タイルの大きさだけ重くなる）
    w.area ??= extractFeatures(map, w.p, SHOP_RADIUS_M + NEAR_M)
    const area = w.area
    const frame = w.frame
    const { roads, footprints } = featuresNear(area, frame.to(shop))
    const pl = placeShop(roads, footprints)
    const bldg = pl.onFootprint ? toPlaced(shop, placeShop(roads, footprints, BUILDING_MAX_SIZE_M)) : null
    const sf = localFrame(shop)
    const marks = landmarks.map((m) => ({ p: sf.to(m), name: m.name, kind: m.kind }))
    const ring = pl.ringIndex !== null ? footprints[pl.ringIndex] : null
    const hasStation = !!ring && stationIn([{ pts: ring, heightM: 0 }], marks.filter((m) => m.kind === 'station').map((m) => m.p)) !== null
    const solid = !!bldg && (pl.areaM2 >= FACILITY_MIN_AREA_M2 || hasStation)
    let facility: Placed['facility'] = null
    // 同じ施設の形をもう計算していれば使い回す（施設ごとに1回）
    if (solid) facility = facilityCache.find((f) => stationIn([{ pts: f.parts[0].ring.map((v) => sf.to(v)), heightM: 0 }], [{ x: 0, y: 0 }]) !== null) ?? null
    if (!facility && solid && bldg) {
      // 広めに集めた輪郭から、店の輪郭と重なる部分（タイルのかけら・高さ違い）を立ち上げる
      const wide = featuresNear(area, frame.to(shop), FACILITY_NEAR_M)
      const idx = placeShop(wide.roads, wide.footprints).ringIndex
      if (idx !== null) {
        const parts = facilityParts(idx, wide.footprints, wide.heights)
        const label = facilityLabel(parts, marks, wide.footprints)
        const d = doorPoint(sf.to(bldg), bldg.facingDeg, parts[0].pts)
        facility = { parts: parts.map((q) => ({ ring: q.pts.map((v) => sf.back(v)), heightM: q.heightM })), door: sf.back(d), ...label }
        facilityCache.push(facility)
      }
    }
    placed.set(shop.id, { main: toPlaced(shop, pl), bldg, areaM2: pl.areaM2, ring: bldg && ring ? ring.map((v) => sf.back(v)) : null, facility })
  }

  // 施設の輪郭の中に、読み込んだ全部の店（霧の中も含む）が2軒以上あるか。店の一覧が変わったときだけ数え直す
  const facilityFull = new WeakMap<NonNullable<Placed['facility']>, { list: Shop[]; ok: boolean }>()
  const hasEnoughShops = (f: NonNullable<Placed['facility']>) => {
    const c = facilityFull.get(f)
    if (c && c.list === shops) return c.ok
    const ring = f.parts[0].ring
    const rf = localFrame(ring[0])
    const ok = enoughShops(ring.map((v) => rf.to(v)), shops.map((s) => rf.to(s)))
    facilityFull.set(f, { list: shops, ok })
    return ok
  }

  // 置き方が分かっている見えている店を組にして、層・ピン・✓ を出す（顔ぶれが変わったときだけ作り直す）
  const showShops = (p: LatLng) => {
    layerAt = performance.now()
    const frame = localFrame(p)
    const visible: { shop: Shop; hit: Placed }[] = []
    const nearAll: Shop[] = [] // 気配などの材料（霧の向こうでも数える。描くかどうかとは別）
    for (const shop of shownVisible) {
      if (placed.get(shop.id)) nearAll.push(shop)
      const hit = placed.get(shop.id)
      // 霧の向こう（見ている所からお店までの地面の間に、まだ晴れていない所がある）のお店は、模型もピンも描かない。
      // 2026-11-24 オーナー「雲の上に家がある」: 霧の向こうの晴れた区画の家が、手前の雲より背が高くて雲の上に見えていた。
      // 描くときだけの決まり（気配・図鑑などの「見えるお店」の決まりは変えない）。自分の近くの霧の中の店は今まで通り
      if (hit && distanceMeters(last ?? p, shop) > IN_FOG_VISIBLE_M && behindFog(p, shop, cleared)) continue
      if (hit) visible.push({ shop, hit })
    }
    // 同じ建物（輪郭に合わせた中心がそろう）の見えている店を1組にする
    const byId = new Map(visible.map((v) => [v.shop.id, v]))
    const groups = groupShops(visible.map(({ shop, hit }) => ({ id: shop.id, footprintCenter: hit.bldg ? frame.to(hit.main) : null })))
    // 組ごとの出し方。施設（大型施設・駅）は、見えている店が1軒でも、読み込んだ全部の店で2軒以上なら施設として出す
    const sorted = groups.map((ids) => {
      const members = ids.map((id) => byId.get(id)!)
      const fac = members[0].hit.facility
      const facility = !!fac && (members.length > 1 || hasEnoughShops(fac))
      const center = members.length === 1 ? members[0].hit.main : members[0].hit.bldg!
      // 施設は実際の輪郭で出すので今までどおり。それ以外は模型の中心が霧のセルなら出さない
      const place = facility ? null : modelPlace(center, members.map((m) => m.shop), last ?? p, cleared)
      return { ids, members, facility, place, d: distanceMeters(p, center) }
    }).filter((g) => g.facility || g.place)
    const out: PlacedShop[] = []
    const inFog = new Set<string>() // 霧の中の近い店の模型の id
    const singles: PlacedShop[] = []
    const blds: PinnedBuilding[] = []
    const facs: PlacedFacility[] = []
    type FacGroup = NonNullable<Placed['facility']> & { ids: string[]; center: PlacedShop }
    const facGroups: FacGroup[] = []
    let key = ''
    // 安全のための模型の数の上限（施設は数えない。ふだんは届かない）
    for (const { ids, members, facility, place } of capModels(sorted, MAX_SHOP_MODELS)) {
      if (facility) {
        // 大型施設・駅は、重なった輪郭を整理してからまとめて出す（下）
        facGroups.push({ ...members[0].hit.facility!, ids, center: members[0].hit.bldg! })
      } else if (members.length === 1) {
        out.push(members[0].hit.main)
        singles.push(members[0].hit.main)
        if (place === 'fog') inFog.add(members[0].hit.main.id)
      } else {
        const placedB: PlacedShop = { ...members[0].hit.bldg!, id: `bldg:${ids[0]}`, model: 'building', shopIds: ids }
        out.push(placedB)
        if (place === 'fog') inFog.add(placedB.id)
        blds.push({ placed: placedB, shops: members.map((m) => m.shop), facility: false, topM: placedB.sizeM * BUILDING_TOP_RATE, spots: [], label: null })
      }
      key += `${ids.join('+')}${place === 'fog' ? '~' : ''},`
    }
    // 自分かカメラの真ん中（拡大しているとき）に近い店と、選んだ店は詳しい模型、遠い店は軽い模型
    // （前回詳しかった店は少し遠くまで詳しいまま）
    cameraAt = cameraCenter()
    const cam = cameraAt
    const detailed = pickDetailed(
      out.map((s) => ({ id: s.id, d: distanceMeters(p, s), dCam: cam ? distanceMeters(cam, s) : undefined, must: s.shopIds.some((id) => focusIds.has(id)) })),
      lastDetailed, LOD_NEAR_M, LOD_MARGIN_M, LOD_MAX_DETAILED,
    )
    lastDetailed = detailed
    const drawn = out.map((s) => (detailed.has(s.id) ? s : { ...s, light: true }))
    key += `|${drawn.filter((s) => s.light).map((s) => s.id).join(',')}`
    // 大型施設・駅: 実際の形の立体と、名前の札。輪郭を共有する・形が重なる施設は1つにまとめ（駅があれば駅）、
    // 残りも同じ輪郭を2つの施設が描かないよう、駅を先に並べて重なりを外す
    const merged = mergeFacilities(facGroups, ringKey, (a, b) => ringsOverlap(a.map((v) => frame.to(v)), b.map((v) => frame.to(v))))
    merged.sort((a, b) => Number(b.kind === 'station') - Number(a.kind === 'station'))
    for (const f of dropSharedParts(merged, ringKey)) {
      const { ids, center, parts } = f
      const members = ids.map((id) => byId.get(id)!)
      const cf = localFrame(center)
      const local = parts.map((q) => ({ pts: q.ring.map((v) => cf.to(v)), heightM: q.heightM }))
      const topM = Math.max(...parts.map((q) => q.heightM)) + 0.5
      facs.push({ id: `fac:${ids[0]}`, kind: f.kind, name: f.name, shopIds: ids, parts, topM, facingDeg: center.facingDeg, door: f.door })
      const placedF: PlacedShop = { ...center, id: `fac:${ids[0]}`, model: 'building', shopIds: ids }
      blds.push({
        placed: placedF, shops: members.map((m) => m.shop), facility: true, topM,
        spots: members.map((m) => {
          const at = cf.to(m.shop)
          return { id: m.shop.id, ...at, topM: heightAt(local, at) + 0.5 }
        }),
        label: f.name ? { text: f.name, station: f.kind === 'station' } : null,
      })
    }
    near = nearAll
    if (key === shownKey) return // 顔ぶれが変わったときだけ層を作り直す
    shownKey = key
    shownPlaced = singles
    shownInFog = inFog
    shownFrom = p
    shownBuildings = blds
    shownFacilities = facs
    shopLayer.setShops(drawn.filter((s) => !inFog.has(s.id)))
    fogShopLayer.setShops(drawn.filter((s) => inFog.has(s.id)))
    facilityLayer.setFacilities(facs)
    updateMarks()
  }
  // 1軒の店のピン（✓ は絵の右上）とビルのピンを、済みの一覧に合わせて出し直す
  const updateMarks = () => {
    const done = checkedNow()
    if (shownFrom) shopPins.update(hintedIds.size === 0 ? shownPlaced : shownPlaced.filter((s) => !s.shopIds.some((id) => hintedIds.has(id))), shownInFog, shownFrom, done) // 1軒の店の ✓ はピンの絵の右上
    buildingPins.update(shownBuildings, done)
    shopPins.setClusterInput(clusterFeatures(
      shownPlaced,
      shownBuildings.map((b) => ({ id: b.placed.id, lat: b.placed.lat, lng: b.placed.lng, topM: b.topM, facility: b.facility, shops: b.shops })),
      shownInFog,
      hintedIds,
      done,
    ))
  }

  // クリアした町は全部晴れ。町の形から、雲を置く場所のまわり（TOWN_FILL_HALF_M）だけをセルにして足す。
  // 町が何百km² あってもセルは見えている分だけ。サーバーにも保存しない
  const fillTowns = (origin: LatLng) => {
    for (const town of towns) for (const c of cellsInTown(town, origin, TOWN_FILL_HALF_M)) cleared.add(cellKey(c))
  }

  const setFog = (origin: LatLng) => {
    fillTowns(origin)
    lastClumps = fogClumps(origin, cleared)
    fogLayer.setClumps(origin, [...lastClumps, ...farClumps(origin)])
    fogCenter = origin
    thinSent = null // 原点が変わったので薄さも送り直す
  }

  // 霧の中でお店の近くにいるとき、そのまわりの雲を薄くする
  const updateThin = (p: LatLng) => {
    const nowMs = performance.now()
    const dt = lastTickMs === null ? 0 : Math.max(0, (nowMs - lastTickMs) / 1000)
    lastTickMs = nowMs
    // 候補の洗い出しは、3m 以上動いた・店の一覧や晴れたセルが変わったときだけ。ふだんは候補4軒の距離だけ測り直す
    if (!thinScanAt || thinShops !== shops || thinClearedSize !== cleared.size || distanceMeters(thinScanAt, p) >= THIN_RESCAN_M) {
      thinScanAt = p
      thinShops = shops
      thinClearedSize = cleared.size
      const prev = thinCands
      thinCands = shops
        .map((shop) => ({ shop, d: distanceMeters(p, shop) }))
        .filter(({ shop, d }) => d <= THIN_START_M && !isClearedAt(cleared, shop))
        .sort((a, b) => a.d - b.d)
        .slice(0, THIN_MAX_SPOTS)
        .map(({ shop }) => shop)
      // 晴れたせいで外れた店は、いきなり消さず 0 へ戻してから外す（波が来た瞬間に薄さが飛ばないように）
      const stay = new Set(thinCands.map((c) => c.id))
      for (const shop of prev) {
        if (!stay.has(shop.id) && thinShown.has(shop.id) && isClearedAt(cleared, shop)) thinFading.set(shop.id, shop)
      }
    }
    const cands = thinCands
      .map((shop) => ({ shop, d: distanceMeters(p, shop) }))
      .filter(({ d }) => d <= THIN_START_M)
    const keep = new Set(cands.map((c) => c.shop.id))
    for (const id of thinShown.keys()) if (!keep.has(id) && !thinFading.has(id)) thinShown.delete(id)
    const k = Math.min(1, THIN_EASE_PER_S * dt)
    const next = cands.map(({ shop, d }) => {
      const cur = thinShown.get(shop.id) ?? 0
      const amount = cur + (thinAmount(d) - cur) * k
      thinShown.set(shop.id, amount)
      return { id: shop.id, amount, shop }
    })
    for (const [id, shop] of thinFading) {
      const amount = (thinShown.get(id) ?? 0) * (1 - k)
      if (amount <= THIN_EPS || keep.has(id)) {
        thinFading.delete(id)
        thinShown.delete(id)
      } else {
        thinShown.set(id, amount)
        if (next.length < THIN_MAX_SPOTS) next.push({ id, amount, shop })
      }
    }
    const sent = thinSent
    const same =
      sent !== null &&
      sent.length === next.length &&
      next.every((n, i) => sent[i].id === n.id && Math.abs(sent[i].amount - n.amount) <= THIN_EPS)
    if (same || !fogCenter) return
    thinSent = next.map(({ id, amount }) => ({ id, amount }))
    const frame = localFrame(fogCenter)
    fogLayer.setThin(next.map(({ shop, amount }) => ({ ...frame.to(shop), amount })))
  }

  const fetchAround = (p: LatLng) => {
    fetching = true
    fetchCenter = p
    fetchedCoarse = accuracyM > MAX_ACCURACY_M
    deps.fetchHotpepper(p).then(
      (list) => {
        fetching = false
        failedAt = null
        if (disposed) return
        // 前に読んだ分のうち、今の中心（見ている場所）か自分のまわりのものは残す（遠くを見て戻ったとき、自分のまわりの詳細が消えないように）
        const have = new Set(list.map((h) => h.id))
        hpShops = [...list, ...retainNear(hpShops, [p, last], SHOP_RADIUS_M * 1.5).filter((h) => !have.has(h.id))]
        ready.hp = true
        shops = mergeShops(mapShops, hpShops)
        if (areaNow()) refreshShops(areaNow()!)
      },
      () => {
        fetching = false
        fetchCenter = null // 同じ場所でもやり直せるようにする（ただし SHOP_RETRY_AFTER_FAIL_MS あと）
        failedAt = Date.now()
        if (!disposed) deps.onShopsError()
      },
    )
  }
  const canFetch = (p: LatLng) =>
    deps.shopsEnabled &&
    !fetching &&
    (failedAt === null || Date.now() - failedAt >= SHOP_RETRY_AFTER_FAIL_MS) &&
    (!fetchCenter || distanceMeters(fetchCenter, p) >= SHOP_REFETCH_M || (fetchedCoarse && accuracyM <= MAX_ACCURACY_M))

  const onIdle = () => {
    if (areaNow()) refreshShops(areaNow()!)
  }
  map.on('idle', onIdle)
  const onData = (e: { sourceId?: string; dataType?: string; tile?: unknown }) => {
    if (e.dataType === 'source' && e.sourceId === MAP_SOURCE && e.tile) {
      tilesArrived = true
      tilesSeen = true
      const c = (e.tile as { tileID?: { canonical?: { z: number; x: number; y: number } } }).tileID?.canonical
      const k = c && `${c.z}/${c.x}/${c.y}`
      if (c && k && !tilesKnown.has(k)) {
        tilesKnown.add(k)
        newTiles.push(tileBox(c.z, c.x, c.y))
      }
    }
  }
  map.on('data', onData)
  // カメラが動き終わったら、詳しい模型を選び直す（ついて歩くときは毎コマ来るので、真ん中が動いた・拡大の境を越えたときだけ）
  const cameraCenter = (): LatLng | null => {
    if (map.getZoom() < LOD_CAMERA_MIN_ZOOM) return null
    const c = map.getCenter()
    return { lat: c.lat, lng: c.lng }
  }
  const onMoveEnd = () => {
    if (!refreshedAt) return
    const c = cameraCenter()
    if (!c === !cameraAt && (!c || !cameraAt || distanceMeters(c, cameraAt) < LOD_CAMERA_MOVE_M)) return
    showShops(refreshedAt)
  }
  map.on('moveend', onMoveEnd)

  // 保存済みの晴れたセルを足す（波なし）。失敗したら自宅まわりだけのまま
  deps.loadProgress().then(
    ({ cells, checkedShopIds, visitsByShop }) => {
      // 読み込みの間にチェックインしていたら、多い方（その1回を含む方）を残す
      for (const [id, v] of visitsByShop ?? []) if ((visits.get(id)?.count ?? 0) <= v.count) visits.set(id, v)
      if (disposed) return
      const before = cleared.size
      for (const c of cells) cleared.add(cellKey(c))
      for (const id of checkedShopIds) checkedIds.add(id)
      ready.progress = true
      updateMarks()
      if (cleared.size === before) {
        checkReady()
        return
      }
      if (fogCenter) setFog(fogCenter)
      if (areaNow()) refreshShops(areaNow()!)
      checkReady()
    },
    () => {},
  )

  // クリアした町を足す（波なし）。失敗したら町なしのまま
  deps.loadTowns?.().then(
    (list) => {
      if (disposed) return
      for (const t of list) if (!towns.some((have) => have.id === t.id)) towns.push(t)
      if (list.length === 0 || !fogCenter) return
      const before = cleared.size
      setFog(fogCenter)
      if (cleared.size !== before && areaNow()) refreshShops(areaNow()!)
    },
    () => {},
  )

  // 晴れたセルを足して、from から波で雲を消す
  const addCleared = (cells: Cell[], from: LatLng) => {
    if (disposed) return
    let added = false
    for (const c of cells) {
      const k = cellKey(c)
      if (!cleared.has(k)) {
        cleared.add(k)
        added = true
      }
    }
    if (!added) return
    if (fogCenter) {
      const before = lastClumps
      const after = fogClumps(fogCenter, cleared)
      fogLayer.setClumps(fogCenter, [...waveClumps(before, after, localFrame(fogCenter).to(from), performance.now() / 1000), ...farClumps(fogCenter)])
      lastClumps = after
    }
    if (areaNow()) refreshShops(areaNow()!)
  }

  // 押された物と、カメラを寄せる先（ピンが先、次に 3D の模型のうち一番手前、外れたら指の大きさの円）
  const pickTarget = (point: { x: number; y: number }): { ids: string[]; at: LatLng | null } | null => {
    const pin = shopPins.pick(point)
    if (pin) return { ids: pin, at: null }
    const hits = [shopLayer.rayPick(point), fogShopLayer.rayPick(point), facilityLayer.rayPick(point)].filter((h) => h !== null)
    if (hits.length) {
      const h = hits.reduce((a, b) => (b.distance < a.distance ? b : a))
      return { ids: h.ids, at: h.at }
    }
    const ids = fogShopLayer.pick(point, true) ?? shopLayer.pick(point, true) ?? facilityLayer.pick(point, true)
    return ids ? { ids, at: null } : null
  }

  return {
    setAccuracy(m) {
      accuracyM = m
    },
    onPosition(p) {
      if (disposed) return
      last = p
      if (!fogCenter) {
        const below = PLAYER_LAYERS.find((id) => map.getLayer(id))
        // 下から 大型施設 → お店 → 霧 → 霧の中の近い店。霧はお店の奥行きと比べて描くので、お店より後
        map.addLayer(facilityLayer, below)
        map.addLayer(shopLayer, below)
        map.addLayer(fogLayer, below)
        map.addLayer(fogShopLayer, below)
        // ピン（1 軒・まとめ・気配）は 1 つの層で、いちばん上（雲・自分のキャラより上。2026-11-16 オーナー）
        shopPins.attach()
        setFog(view ?? p)
      } else if (distanceMeters(fogCenter, view ?? p) >= FOG_REBUILD_M) {
        setFog(view ?? p)
      }
      updateThin(p)
      const a = view ?? p
      if (canFetch(a)) fetchAround(a)
      if (!refreshedAt || distanceMeters(refreshedAt, a) >= SHOP_REFRESH_M) refreshShops(a)
    },
    setView(center) {
      view = center
      const origin = view ?? last
      if (disposed || !fogCenter || !origin) return
      if (distanceMeters(fogCenter, origin) >= FOG_REBUILD_M) setFog(origin)
      if (canFetch(origin)) fetchAround(origin)
      if (!refreshedAt || distanceMeters(refreshedAt, origin) >= SHOP_REFRESH_M) refreshShops(origin)
    },
    facilityHeightAt: (p) => {
      let top = 0
      for (const f of shownFacilities) for (const q of f.parts) if (ringHas(q.ring, p)) top = Math.max(top, q.heightM + 0.1) // 屋根と同じ高さだと面がちらつくので少し上
      return top
    },
    shopsNear: () => near,
    titleOf: (ids) => shownFacilities.find((f) => f.shopIds.includes(ids[0]))?.name ?? null,
    // 押した点にある建物の取り違えを防ぐ（2026-11-23 オーナー「タップした建物と違う建物に飛ぶ」）。
    // 前は「店の円の当たり → 施設の輪郭」の順で、円や屋根の広がりが重なると隣の建物が勝っていた。
    // 今は実際の模型に画面から線を引いて、一番手前に当たった物を取る。線がどれにも当たらないとき（細い所・指のずれ）だけ、前の円・輪郭の判定にもどる
    pickTarget: (point) => pickTarget(point),
    pick: (point) => pickTarget(point)?.ids ?? null,
    focus(shopIds) {
      focusIds = new Set(shopIds ?? [])
      if (refreshedAt && !disposed) showShops(refreshedAt)
    },
    addCleared,
    addTown(town, from) {
      if (disposed || towns.some((have) => have.id === town.id)) return
      towns.push(town)
      // 雲がまだ無ければ、最初の setFog が町を足す
      if (fogCenter) addCleared(cellsInTown(town, fogCenter, TOWN_FILL_HALF_M), from ?? last ?? fogCenter)
    },
    markChecked(shopId, mapId) {
      checkedIds.add(shopId)
      if (mapId) checkedIds.add(mapId)
      // サーバーは送った id（shopId）で記録する。合体した店の mapId 側は visitsFor で合わせる
      visits.set(shopId, addVisit(visits.get(shopId), jstDay(new Date())))
      updateMarks()
    },
    checked: checkedNow,
    hintInputs: () => ({ shops, near, cleared, checked: checkedNow() }),
    setHintedShops(ids) {
      hintedIds = ids
      updateMarks()
    },
    setHintPins: (pins) => shopPins.setHints(pins),
    bounceHint: (id) => shopPins.bounceHint(id),
    setPinsVisible(visible) {
      shopPins.setVisible(visible)
      buildingPins.setHidden(!visible)
    },
    shopsReady: () => ready.fired,
    checkedToday(shop) {
      return visitsFor(shop)?.lastDay === jstDay(new Date())
    },
    visitsFor,
    progressReady: () => ready.progress,
    dispose() {
      disposed = true
      if (frameId !== null) cancelAnimationFrame(frameId)
      stopUserMove()
      shopPins.dispose()
      buildingPins.dispose()
      debugOverlay?.dispose()
      map.off('idle', onIdle)
      map.off('data', onData)
      map.off('moveend', onMoveEnd)
      for (const id of [fogLayer.id, facilityLayer.id, shopLayer.id, fogShopLayer.id]) if (map.getLayer(id)) map.removeLayer(id)
    },
  }
}
