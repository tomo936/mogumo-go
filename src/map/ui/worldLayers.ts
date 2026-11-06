import type { Map as MapLibreMap } from 'maplibre-gl'
import { FOG_REBUILD_M, THIN_START_M } from '../../fog/config.ts'
import { clearedFromHome, isClearedAt } from '../../fog/domain/clearing.ts'
import { fogClumps } from '../../fog/domain/clumps.ts'
import type { Clump } from '../../fog/domain/clumps.ts'
import { cellKey } from '../../fog/domain/grid.ts'
import type { Cell } from '../../fog/domain/grid.ts'
import { thinAmount, waveClumps } from '../../fog/domain/wave.ts'
import { createFogLayer } from '../../fog/infra/fogLayer.ts'
import { MAP_SHOPS_REEXTRACT_M, SHOP_RADIUS_M, SHOP_REFETCH_M, SHOP_REFRESH_M, SHOP_RETRY_AFTER_FAIL_MS } from '../../shops/config.ts'
import { mergeShops } from '../../shops/domain/merge.ts'
import { placeShop } from '../../shops/domain/placement.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { visibleShops } from '../../shops/domain/visibility.ts'
import { extractFeatures, featuresNear, NEAR_M } from '../../shops/infra/mapFeatures.ts'
import type { AreaFeatures } from '../../shops/infra/mapFeatures.ts'
import { extractMapShops } from '../../shops/infra/mapShops.ts'
import { createCheckMarks } from '../../shops/infra/checkMarks.ts'
import { createShopLayer } from '../../shops/infra/shopLayer.ts'
import type { PlacedShop } from '../../shops/infra/shopLayer.ts'
import { distanceMeters, localFrame } from '../domain/geo.ts'
import type { LatLng } from '../domain/geo.ts'
import { jstDay } from '../../checkin/domain/day.ts'

type Deps = {
  home: LatLng | null
  fetchHotpepper: (center: LatLng) => Promise<Shop[]>
  shopsEnabled: boolean
  onShopsError: () => void
  loadProgress: () => Promise<{ cells: Cell[]; checkedShopIds: Set<string>; lastDayByShop?: Map<string, string> }>
}

const THIN_EASE_PER_S = 3 // 薄さが目標に近づく速さ（1秒あたり）
const THIN_MAX_SPOTS = 4
const THIN_EPS = 0.01
const THIN_RESCAN_M = 3 // 候補の洗い出しをやり直す移動距離

// 霧（雲の塊）とお店の建物を地図に載せ、位置が変わるたびに更新する
type WorldMap = MapLibreMap

// 自分の位置の印（MapView で下から順に足す）。霧とお店はこれより下に入れる
const PLAYER_LAYERS = ['me-circle-fill', 'me-circle-line', 'me-shadow']

// 店ごとの置き方。main が輪郭に合わせたとき、同じ輪郭を先に使う店があれば free（輪郭なし）を使う
type Placed = { main: PlacedShop; free: PlacedShop | null }

type World = {
  onPosition(p: LatLng): void
  shopsNear(): Shop[]
  pick(point: { x: number; y: number }): string | null
  addCleared(cells: Cell[], from: LatLng): void
  markChecked(shopId: string, mapId?: string | null): void
  checked(): ReadonlySet<string> // 済みの店 id（合体した店は、地図の点の id で済みでも含む）
  checkedToday(shop: { id: string; mapId: string | null }): boolean // 今日（日本時間）もうチェックインした店か
  dispose(): void
}

export function attachWorld(map: WorldMap, deps: Deps): World {
  const cleared = clearedFromHome(deps.home)
  const fogLayer = createFogLayer()
  const shopLayer = createShopLayer()
  const checkMarks = createCheckMarks(map)
  let shownPlaced: PlacedShop[] = [] // いま層に渡している置き方
  let fogCenter: LatLng | null = null // 雲の塊を置いたときの現在地
  let lastClumps: Clump[] = [] // 層に最後に渡した雲の塊（波の「変わる前」）
  const checkedIds = new Set<string>() // サーバーが知っている id と、今回付けた id（hp: と osm: の両方がありうる）
  const lastDay = new Map<string, string>() // 店 id ごとの、最後にチェックインした日（日本時間）
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
  let hpShops: Shop[] = [] // ホットペッパーの最後に成功した結果
  let mapShops: Shop[] = [] // 地図タイルのお店（タイルが読めたときだけ更新）
  let shops: Shop[] = [] // 2つを合わせたもの
  let near: Shop[] = [] // いま層に渡している店（近い順）
  let last: LatLng | null = null
  let shownKey: string | null = null
  const placed = new Map<string, Placed>() // 店ごとの置き方（一度だけ計算）

  const toPlaced = (shop: Shop, pl: ReturnType<typeof placeShop>): PlacedShop => {
    const c = localFrame(shop).back(pl.center)
    return { id: shop.id, kind: shop.kind, lat: c.lat, lng: c.lng, facingDeg: pl.facingDeg, sizeM: pl.sizeM }
  }

  let refreshedAt: LatLng | null = null
  let extractedAt: LatLng | null = null
  const refreshShops = (p: LatLng) => {
    refreshedAt = p
    if (!map.areTilesLoaded()) extractedAt = null // 読めなかった回があれば、読めたあとの最初の更新で必ず読み直す
    // 地図のお店の読み直し（取り出しと合体は重い）は、まだ読んでいない・前回から MAP_SHOPS_REEXTRACT_M 以上動いたときだけ（idle は回転のたびに来る）。
    // 見える・見えないの計算は SHOP_REFRESH_M ごとに別でやる
    if (map.areTilesLoaded() && (!extractedAt || distanceMeters(extractedAt, p) >= MAP_SHOPS_REEXTRACT_M)) {
      extractedAt = p
      mapShops = extractMapShops(map, p, SHOP_RADIUS_M)
      shops = mergeShops(mapShops, hpShops)
    }
    // タイルは1回の更新で1回だけ読む（店ごとに読むと、店の数×タイルの大きさだけ重くなる）
    let area: AreaFeatures | null = null
    const frame = localFrame(p)
    const out: PlacedShop[] = []
    const shown: Shop[] = []
    const usedFootprints: LatLng[] = [] // 輪郭に合わせて置いた店の中心
    let key = ''
    for (const shop of visibleShops(shops, p, cleared)) { // 近い順
      let hit = placed.get(shop.id)
      if (!hit) {
        if (!map.areTilesLoaded()) continue // タイル読み込み中は置かない。idle のときにやり直す
        area ??= extractFeatures(map, p, SHOP_RADIUS_M + NEAR_M)
        const { roads, footprints } = featuresNear(area, frame.to(shop))
        const pl = placeShop(roads, footprints)
        hit = { main: toPlaced(shop, pl), free: pl.onFootprint ? toPlaced(shop, placeShop(roads, [])) : null }
        placed.set(shop.id, hit)
      }
      const main = hit.main
      const taken = hit.free !== null && usedFootprints.some((c) => distanceMeters(c, main) < 1)
      const s = taken ? hit.free! : main
      if (hit.free && !taken) usedFootprints.push(main)
      out.push(s)
      shown.push(shop)
      key += `${s.id}${taken ? '*' : ''},`
    }
    near = shown
    if (key === shownKey) return // 顔ぶれが変わったときだけ層を作り直す
    shownKey = key
    shownPlaced = out
    shopLayer.setShops(out)
    checkMarks.update(out, checkedNow())
  }

  const setFog = (origin: LatLng) => {
    lastClumps = fogClumps(origin, cleared)
    fogLayer.setClumps(origin, lastClumps)
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

  // 保存済みの晴れたセルを足す（波なし）。失敗したら自宅まわりだけのまま
  deps.loadProgress().then(
    ({ cells, checkedShopIds, lastDayByShop }) => {
      for (const [id, day] of lastDayByShop ?? []) if (!lastDay.has(id) || day > lastDay.get(id)!) lastDay.set(id, day)
      if (disposed) return
      const before = cleared.size
      for (const c of cells) cleared.add(cellKey(c))
      for (const id of checkedShopIds) checkedIds.add(id)
      checkMarks.update(shownPlaced, checkedNow())
      if (cleared.size === before) return
      if (fogCenter) setFog(fogCenter)
      if (last) refreshShops(last)
    },
    () => {},
  )

  return {
    onPosition(p) {
      if (disposed) return
      last = p
      if (!fogCenter) {
        const below = PLAYER_LAYERS.find((id) => map.getLayer(id))
        map.addLayer(fogLayer, below)
        map.addLayer(shopLayer, below) // お店は霧より上
        setFog(p)
      } else if (distanceMeters(fogCenter, p) >= FOG_REBUILD_M) {
        setFog(p)
      }
      updateThin(p)
      if (canFetch(p)) fetchAround(p)
      if (!refreshedAt || distanceMeters(refreshedAt, p) >= SHOP_REFRESH_M) refreshShops(p)
    },
    shopsNear: () => near,
    pick: (point) => shopLayer.pick(point),
    addCleared(cells, from) {
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
        fogLayer.setClumps(fogCenter, waveClumps(before, after, localFrame(fogCenter).to(from), performance.now() / 1000))
        lastClumps = after
      }
      if (last) refreshShops(last)
    },
    markChecked(shopId, mapId) {
      checkedIds.add(shopId)
      if (mapId) checkedIds.add(mapId)
      const today = jstDay(new Date())
      lastDay.set(shopId, today)
      if (mapId) lastDay.set(mapId, today)
      checkMarks.update(shownPlaced, checkedNow())
    },
    checked: checkedNow,
    checkedToday(shop) {
      const today = jstDay(new Date())
      return lastDay.get(shop.id) === today || (shop.mapId !== null && lastDay.get(shop.mapId) === today)
    },
    dispose() {
      disposed = true
      checkMarks.dispose()
      map.off('idle', onIdle)
      for (const id of [fogLayer.id, shopLayer.id]) if (map.getLayer(id)) map.removeLayer(id)
    },
  }
}
