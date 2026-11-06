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

export type Shop = {
  id: string
  name: string
  lat: number
  lng: number
  kind: ShopKind
}
