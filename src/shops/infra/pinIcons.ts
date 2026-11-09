// お店のピンの絵（シロの色分けの完成形を 128px にしたもの。元は art/pins/colored/）
import type { ShopKind } from '../domain/shop.ts'
import bakery from '../../assets/pins/bakery.png'
import cafe from '../../assets/pins/cafe.png'
import cake from '../../assets/pins/cake.png'
import chinese from '../../assets/pins/chinese.png'
import curry from '../../assets/pins/curry.png'
import izakaya from '../../assets/pins/izakaya.png'
import mystery from '../../assets/pins/mystery.png'
import ramen from '../../assets/pins/ramen.png'
import soba from '../../assets/pins/soba.png'
import sushi from '../../assets/pins/sushi.png'
import washoku from '../../assets/pins/washoku.png'
import western from '../../assets/pins/western.png'
import yakiniku from '../../assets/pins/yakiniku.png'

export const PIN_ICON: Record<ShopKind, string> = {
  ramen, sushi, soba, washoku, izakaya, chinese, yakiniku, western, curry, cafe, cake, bakery, mystery,
}
