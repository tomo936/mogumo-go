import type { Map as MapLibreMap } from 'maplibre-gl'
import { SEA_REBUILD_M } from '../../fog/config.ts'
import { clearedFromHome } from '../../fog/domain/clearing.ts'
import { cloudSpots } from '../../fog/domain/cloudSpots.ts'
import { createCloudLayer } from '../../fog/infra/cloudLayer.ts'
import { addSea } from '../../fog/infra/seaLayer.ts'
import { SHOP_REFETCH_M } from '../../shops/config.ts'
import { placeShop } from '../../shops/domain/placement.ts'
import type { Shop } from '../../shops/domain/shop.ts'
import { visibleShops } from '../../shops/domain/visibility.ts'
import { roadsAndFootprints } from '../../shops/infra/mapFeatures.ts'
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
export function attachWorld(map: MapLibreMap, deps: Deps): { onPosition(p: LatLng): void; dispose(): void } {
  const cleared = clearedFromHome(deps.home)
  const cloudLayer = createCloudLayer()
  const shopLayer = createShopLayer()
  let sea: ReturnType<typeof addSea> | null = null
  let seaCenter: LatLng | null = null
  let fetchCenter: LatLng | null = null
  let fetching = false
  let disposed = false
  let shops: Shop[] = []
  let last: LatLng | null = null
  let shownKey: string | null = null
  const placed = new Map<string, PlacedShop>() // 店ごとの置き方（一度だけ計算）

  const placeOne = (shop: Shop): PlacedShop | null => {
    const hit = placed.get(shop.id)
    if (hit) return hit
    const { roads, footprints } = roadsAndFootprints(map, shop)
    if (roads.length === 0 && footprints.length === 0) return null // タイルがまだ無い。次の更新でやり直す
    const pl = placeShop(roads, footprints)
    const c = localFrame(shop).back(pl.center)
    const out: PlacedShop = { id: shop.id, kind: shop.kind, lat: c.lat, lng: c.lng, facingDeg: pl.facingDeg, sizeM: pl.sizeM }
    placed.set(shop.id, out)
    return out
  }

  const refreshShops = (p: LatLng) => {
    const list = visibleShops(shops, p, cleared).map(placeOne)
    const out = list.filter((s): s is PlacedShop => s !== null)
    const key = out.map((s) => s.id).join(',')
    if (key === shownKey) return // 毎コマ呼ばれるので、顔ぶれが変わったときだけ層を作り直す
    shownKey = key
    shopLayer.setShops(out)
  }

  const fetchAround = (p: LatLng) => {
    fetching = true
    fetchCenter = p
    deps.fetchShops(p).then(
      (list) => {
        fetching = false
        if (disposed) return
        shops = list
        if (last) refreshShops(last)
      },
      () => {
        fetching = false
        if (!disposed) deps.onShopsError()
      },
    )
  }

  return {
    onPosition(p) {
      if (disposed) return
      last = p
      if (!sea || !seaCenter) {
        sea = addSea(map, p, cleared)
        map.addLayer(cloudLayer)
        cloudLayer.setSpots(cloudSpots(p, cleared), p)
        map.addLayer(shopLayer)
        seaCenter = p
      } else if (distanceMeters(seaCenter, p) >= SEA_REBUILD_M) {
        sea.update(p, cleared)
        cloudLayer.setSpots(cloudSpots(p, cleared), p)
        seaCenter = p
      }
      if (deps.shopsEnabled && !fetching && (!fetchCenter || distanceMeters(fetchCenter, p) >= SHOP_REFETCH_M)) fetchAround(p)
      refreshShops(p)
    },
    dispose() {
      disposed = true
      sea?.remove()
      for (const id of [cloudLayer.id, shopLayer.id]) if (map.getLayer(id)) map.removeLayer(id)
    },
  }
}
