// 気配（デイリー）まわりの調整値。何も import しない。
export const HINT_HOME_RADIUS_M = 1000 // 自宅の範囲
export const HINT_AWAY_RADIUS_M = 1000 // 自宅の外・作り直しのときの、今いる場所のまわりの範囲
export const HINT_FAST_KMH = 15 // これより速い間は気配を作らない
export const HINT_REVEAL_M = 30 // 店名を明かす距離
export const HINT_READY_TIMEOUT_MS = 30000 // お店の読み込みを待つ最大時間
export const HINT_DAY_CHECK_MS = 60000 // 日付の切り替わりを見る間隔
export const HINT_NONE_GUIDE_COUNT = 3 // 気配なしの日に案内する店の数
export const REVEAL_BANNER_MS = 3000 // 明かしの帯を出す時間
export const HINT_MAX_HP_CANDIDATES = 100 // 送る hp 候補の上限（サーバーと同じ値）
export const HINT_MAX_OSM_CANDIDATES = 50 // 送る osm 候補の上限（サーバーと同じ値）
export const HINT_REGEN_MIN_M = 1500 // 「この辺りで探し直す」に要る、今の組からの距離（サーバーと同じ値）
export const HINT_SPEED_WINDOW_MS = 20000 // 速さを測る時間の幅
export const HINT_SLOW_HOLD_MS = 30000 // 速かったあと、遅い状態がこれだけ続けば作る
export const HINT_SPEED_MIN_SPAN_MS = 5000 // 速さを出すのに要る最小の時間の幅
