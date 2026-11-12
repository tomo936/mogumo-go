import type { Map as MapLibreMap } from 'maplibre-gl'
import { FOG_REBUILD_M, THIN_START_M } from '../../fog/config.ts'
import { clearedFromHome, isClearedAt } from '../../fog/domain/clearing.ts'
import { farClumps, fogClumps } from '../../fog/domain/clumps.ts'
import type { Clump } from '../../fog/domain/clumps.ts'
import { cellKey } from '../../fog/domain/grid.ts'
import type { Cell } from '../../fog/domain/grid.ts'
import { thinAmount, waveClumps } from '../../fog/domain/wave.ts'
import { TOWN_FILL_HALF_M } from '../../towns/config.ts'
import { cellsInTown } from '../../towns/domain/shape.ts'
import type { ClearedTown } from '../../towns/domain/shape.ts'
import { createFogLayer } from '../../fog/infra/fogLayer.ts'
import { BUILDING_MAX_SIZE_M, BUILDING_TOP_RATE, FACILITY_MIN_AREA_M2, FACILITY_NEAR_M, LAYER_UPDATE_MS, LOD_CAMERA_MIN_ZOOM, LOD_CAMERA_MOVE_M, LOD_MARGIN_M, LOD_MAX_DETAILED, LOD_NEAR_M, MAP_SHOPS_REEXTRACT_M, MAX_SHOP_MODELS, PLACE_BUDGET_MS, SHOP_RADIUS_M, SHOP_REFETCH_M, SHOP_REFRESH_M, SHOP_RETRY_AFTER_FAIL_MS } from '../../shops/config.ts'
import { doorPoint, dropSharedParts, enoughShops, facilityLabel, facilityParts, heightAt, mergeFacilities, ringsOverlap, stationIn } from '../../shops/domain/facility.ts'
import { groupShops } from '../../shops/domain/grouping.ts'
import { capModels, pickDetailed } from '../../shops/domain/lod.ts'
import { mergeShops } from '../../shops/domain/merge.ts'
import { placeShop } from '../../shops/domain/placement.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { modelPlace, visibleShops } from '../../shops/domain/visibility.ts'
import { extractFeatures, featuresNear, NEAR_M } from '../../shops/infra/mapFeatures.ts'
import type { AreaFeatures } from '../../shops/infra/mapFeatures.ts'
import { extractMapShops } from '../../shops/infra/mapShops.ts'
import type { Landmark } from '../../shops/infra/mapShops.ts'
import { createDebugOverlay, debugOn } from './debugOverlay.ts'
import { createBuildingPins } from '../../shops/infra/buildingPins.ts'
import { createFacilityLayer } from '../../shops/infra/facilityLayer.ts'
import type { PlacedFacility } from '../../shops/infra/facilityPick.ts'
import type { PinnedBuilding } from '../../shops/infra/buildingPins.ts'
import { createShopPins } from '../../shops/infra/shopPins.ts'
import { createShopLayer } from '../../shops/infra/shopLayer.ts'
import type { PlacedShop } from '../../shops/infra/shopLayer.ts'
import { distanceMeters, localFrame } from '../domain/geo.ts'
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

// 自分の位置の印（MapView で下から順に足す）。霧とお店はこれより下に入れる
const PLAYER_LAYERS = ['me-circle-fill', 'me-ripple-0', 'me-shadow']

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
  shopsNear(): Shop[]
  pick(point: { x: number; y: number }): string[] | null // 押された建物の店の id（ビルなら全員）
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
  let fogCenter: LatLng | null = null // 雲の塊を置いたときの現在地
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
  let fetching = false
  let failedAt: number | null = null
  let disposed = false
  // お店の読み込みがそろったか: ホットペッパー（使えない環境では不要）・地図のお店の取り出し・進み具合
  const ready = { hp: !deps.shopsEnabled, map: false, progress: false, fired: false }
  const checkReady = () => {
    if (ready.fired || disposed || !ready.hp || !ready.map || !ready.progress) return
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
  const refreshShops = (p: LatLng) => {
    refreshedAt = p
    if (!map.areTilesLoaded()) extractedAt = null // 読めなかった回があれば、読めたあとの最初の更新で必ず読み直す
    // 地図のお店の読み直し（取り出しと合体は重い）は、まだ読んでいない・前回から MAP_SHOPS_REEXTRACT_M 以上動いたときだけ（idle は回転のたびに来る）。
    // 見える・見えないの計算は SHOP_REFRESH_M ごとに別でやる
    if (map.areTilesLoaded() && (!extractedAt || distanceMeters(extractedAt, p) >= MAP_SHOPS_REEXTRACT_M)) {
      extractedAt = p
      const lm: Landmark[] = []
      mapShops = extractMapShops(map, p, SHOP_RADIUS_M, lm)
      landmarks = lm
      shops = mergeShops(mapShops, hpShops)
      ready.map = true
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
    shownVisible = visibleShops(shops, p, cleared)
    if (!map.areTilesLoaded()) {
      work = null // タイル読み込み中は置かない。idle のときにやり直す
    } else {
      const queue = shownVisible.filter((s) => !placed.has(s.id))
      // 地図から取り出した道路・建物は、列を計算し終えるまで使い回す（動いたら作り直す）
      work = work && distanceMeters(work.p, p) < SHOP_REFRESH_M ? { ...work, queue } : { p, frame: localFrame(p), area: null, queue }
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
      if (performance.now() - t0 >= PLACE_BUDGET_MS) break
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
  const facilityFull = new Map<NonNullable<Placed['facility']>, { list: Shop[]; ok: boolean }>()
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
    for (const shop of shownVisible) {
      const hit = placed.get(shop.id)
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
      const place = facility ? null : modelPlace(center, members.map((m) => m.shop), p, cleared)
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
    near = visible.map((v) => v.shop)
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
    deps.fetchHotpepper(p).then(
      (list) => {
        fetching = false
        failedAt = null
        if (disposed) return
        hpShops = list
        ready.hp = true
        shops = mergeShops(mapShops, hpShops)
        if (last) refreshShops(last)
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
    (!fetchCenter || distanceMeters(fetchCenter, p) >= SHOP_REFETCH_M)

  const onIdle = () => {
    if (last) refreshShops(last)
  }
  map.on('idle', onIdle)
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
      if (last) refreshShops(last)
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
      if (cleared.size !== before && last) refreshShops(last)
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
    if (last) refreshShops(last)
  }

  return {
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
        // お店のピン: 晴れた所の店は雲の下、霧の中の近い店は雲の上。どちらも自分の印より下
        shopPins.attach(fogLayer.id, below)
        setFog(p)
      } else if (distanceMeters(fogCenter, p) >= FOG_REBUILD_M) {
        setFog(p)
      }
      updateThin(p)
      if (canFetch(p)) fetchAround(p)
      if (!refreshedAt || distanceMeters(refreshedAt, p) >= SHOP_REFRESH_M) refreshShops(p)
    },
    shopsNear: () => near,
    titleOf: (ids) => shownFacilities.find((f) => f.shopIds.includes(ids[0]))?.name ?? null,
    pick: (point) => shopPins.pick(point) ?? fogShopLayer.pick(point) ?? shopLayer.pick(point) ?? facilityLayer.pick(point), // 手前に出やすい小さい模型を先に
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
      map.off('moveend', onMoveEnd)
      for (const id of [fogLayer.id, facilityLayer.id, shopLayer.id, fogShopLayer.id]) if (map.getLayer(id)) map.removeLayer(id)
    },
  }
}
