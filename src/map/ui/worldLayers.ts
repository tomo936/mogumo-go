import type { Map as MapLibreMap } from 'maplibre-gl'
import { SEA_REBUILD_M } from '../../fog/config.ts'
import { clearedFromHome } from '../../fog/domain/clearing.ts'
import { cloudSpots } from '../../fog/domain/cloudSpots.ts'
import { createCloudLayer } from '../../fog/infra/cloudLayer.ts'
import { addSea } from '../../fog/infra/seaLayer.ts'
import { SHOP_RADIUS_M, SHOP_REFETCH_M, SHOP_REFRESH_M, SHOP_RETRY_AFTER_FAIL_MS } from '../../shops/config.ts'
import { placeShop } from '../../shops/domain/placement.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { visibleShops } from '../../shops/domain/visibility.ts'
import { extractFeatures, featuresNear, NEAR_M } from '../../shops/infra/mapFeatures.ts'
import type { AreaFeatures } from '../../shops/infra/mapFeatures.ts'
import { createShopLayer } from '../../shops/infra/shopLayer.ts'
import type { PlacedShop } from '../../shops/infra/shopLayer.ts'
import { distanceMeters, localFrame } from '../domain/geo.ts'
import type { LatLng } from '../domain/geo.ts'

type Deps = {
  home: LatLng | null
  fetchShops: (center: LatLng) => Promise<Shop[]>
  shopsEnabled: boolean
  onShopsError: () => void
}

// 霧（雲海と雲）とお店の建物を地図に載せ、位置が変わるたびに更新する
type WorldMap = MapLibreMap

// 自分の位置の印（MapView で下から順に足す）。霧とお店はこれより下に入れる
const PLAYER_LAYERS = ['me-circle-fill', 'me-circle-line', 'me-shadow']

// 店ごとの置き方。main が輪郭に合わせたとき、同じ輪郭を先に使う店があれば free（輪郭なし）を使う
type Placed = { main: PlacedShop; free: PlacedShop | null }

export function attachWorld(map: WorldMap, deps: Deps): { onPosition(p: LatLng): void; dispose(): void } {
  const cleared = clearedFromHome(deps.home)
  const cloudLayer = createCloudLayer()
  const shopLayer = createShopLayer()
  let sea: ReturnType<typeof addSea> | null = null
  let seaCenter: LatLng | null = null
  let fetchCenter: LatLng | null = null
  let fetching = false
  let failedAt: number | null = null
  let disposed = false
  let shops: Shop[] = []
  let last: LatLng | null = null
  let shownKey: string | null = null
  const placed = new Map<string, Placed>() // 店ごとの置き方（一度だけ計算）

  const toPlaced = (shop: Shop, pl: ReturnType<typeof placeShop>): PlacedShop => {
    const c = localFrame(shop).back(pl.center)
    return { id: shop.id, kind: shop.kind, lat: c.lat, lng: c.lng, facingDeg: pl.facingDeg, sizeM: pl.sizeM }
  }

  let refreshedAt: LatLng | null = null
  const refreshShops = (p: LatLng) => {
    refreshedAt = p
    // タイルは1回の更新で1回だけ読む（店ごとに読むと、店の数×タイルの大きさだけ重くなる）
    let area: AreaFeatures | null = null
    const frame = localFrame(p)
    const out: PlacedShop[] = []
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
      key += `${s.id}${taken ? '*' : ''},`
    }
    if (key === shownKey) return // 顔ぶれが変わったときだけ層を作り直す
    shownKey = key
    shopLayer.setShops(out)
  }

  const fetchAround = (p: LatLng) => {
    fetching = true
    fetchCenter = p
    deps.fetchShops(p).then(
      (list) => {
        fetching = false
        failedAt = null
        if (disposed) return
        shops = list
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

  return {
    onPosition(p) {
      if (disposed) return
      last = p
      if (!sea || !seaCenter) {
        const below = PLAYER_LAYERS.find((id) => map.getLayer(id))
        sea = addSea(map, p, cleared, below)
        map.addLayer(cloudLayer, below)
        cloudLayer.setSpots(cloudSpots(p, cleared), p)
        map.addLayer(shopLayer, below)
        seaCenter = p
      } else if (distanceMeters(seaCenter, p) >= SEA_REBUILD_M) {
        sea.update(p, cleared)
        cloudLayer.setSpots(cloudSpots(p, cleared), p)
        seaCenter = p
      }
      if (canFetch(p)) fetchAround(p)
      if (!refreshedAt || distanceMeters(refreshedAt, p) >= SHOP_REFRESH_M) refreshShops(p)
    },
    dispose() {
      disposed = true
      map.off('idle', onIdle)
      sea?.remove()
      for (const id of [cloudLayer.id, shopLayer.id]) if (map.getLayer(id)) map.removeLayer(id)
    },
  }
}
