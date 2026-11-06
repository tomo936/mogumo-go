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
  | 'mystery'

// ホットペッパー由来の詳細。地図だけの店は Shop.details が null
export type ShopDetails = {
  genreCode: string | null
  genreName: string | null
  catch: string | null
  budgetName: string | null
  open: string | null
}

export type Shop = {
  id: string
  name: string
  lat: number
  lng: number
  kind: ShopKind
  details: ShopDetails | null
}
