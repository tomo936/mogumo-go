// お店まわりの調整値。何も import しない。
export const SHOP_RADIUS_M = 1000
export const SHOP_REFETCH_M = 500
export const MAX_SHOPS = 40
export const SHOP_MIN_SIZE_M = 14
export const SHOP_MAX_SIZE_M = 30
export const SHOP_RETRY_WAIT_MS = 3000
export const SHOP_REFRESH_M = 10 // お店の見える・見えないを計算し直す移動距離
export const SHOP_RETRY_AFTER_FAIL_MS = 60000 // 取得に失敗したあと、やり直すまで待つ時間
export const SHOP_CENTER_GRID_M = 250 // お店の問い合わせに送る中心を丸める世界固定のマスの一辺
export const MATCH_DISTANCE_M = 40 // 地図のお店とホットペッパーのお店を同じ店とみなす最大距離
export const IN_FOG_VISIBLE_M = 50 // 霧の中でも、この距離以内なら店を出す
