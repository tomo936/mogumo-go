export type ShopKind =
  | 'ramen'
  | 'sushi'
  | 'soba'
  | 'washoku'
  | 'izakaya'
  | 'chinese'
  | 'yakiniku'
  | 'western'
  | 'curry'
  | 'cafe'
  | 'cake'
  | 'bakery'
  | 'mystery' // その他（ジャンル不明）。ピンの絵は other（フォークとナイフ）
  | 'donburi'
  | 'burger'
  | 'ethnic'
  | 'okonomiyaki'
  | 'takoyaki'

// ホットペッパー由来の詳細。地図だけの店は Shop.details が null
export type ShopDetails = {
  genreCode: string | null
  genreName: string | null
  catch: string | null
  budgetName: string | null
  photoUrl: string | null // https:// のものだけ（ホットペッパーの写真）
  open: string | null
}

export type Shop = {
  id: string
  name: string
  lat: number
  lng: number
  kind: ShopKind
  details: ShopDetails | null
  // 地図と合体したホットペッパーの店だけ、元の地図の点の id（osm:…）。それ以外は null
  mapId: string | null
}
