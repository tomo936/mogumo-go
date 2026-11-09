// お店のピンの絵（ミシェーラの枠＋アイコンを合成して 128px にしたもの。作り方は art/prototypes/compose-pins.mjs）
import type { ShopKind } from '../domain/shop.ts'
import bakery from '../../assets/pins/bakery.png'
import cafe from '../../assets/pins/cafe.png'
import cake from '../../assets/pins/cake.png'
import chinese from '../../assets/pins/chinese.png'
import curry from '../../assets/pins/curry.png'
import izakaya from '../../assets/pins/izakaya.png'
import burger from '../../assets/pins/burger.png'
import donburi from '../../assets/pins/donburi.png'
import ethnic from '../../assets/pins/ethnic.png'
import okonomiyaki from '../../assets/pins/okonomiyaki.png'
import other from '../../assets/pins/other.png'
import takoyaki from '../../assets/pins/takoyaki.png'
import ramen from '../../assets/pins/ramen.png'
import soba from '../../assets/pins/soba.png'
import sushi from '../../assets/pins/sushi.png'
import washoku from '../../assets/pins/washoku.png'
import western from '../../assets/pins/western.png'
import yakiniku from '../../assets/pins/yakiniku.png'

export const PIN_ICON: Record<ShopKind, string> = {
  ramen, sushi, soba, washoku, izakaya, chinese, yakiniku, western, curry, cafe, cake, bakery,
  donburi, burger, ethnic, okonomiyaki, takoyaki,
  mystery: other, // 「その他」の店はフォークとナイフ（「？」は気配のピン専用）
}
