// お店まわりの調整値。何も import しない。
export const SHOP_RADIUS_M = 1000
export const SHOP_REFETCH_M = 500
export const MAX_SHOPS = 40
export const SHOP_MIN_SIZE_M = 14
export const SHOP_MAX_SIZE_M = 18 // 建物の大きさは「少し違う」くらいに収める（本人 2026-11-06）
export const SHOP_RETRY_WAIT_MS = 3000
export const SHOP_REFRESH_M = 10 // お店の見える・見えないを計算し直す移動距離
export const SHOP_RETRY_AFTER_FAIL_MS = 60000 // 取得に失敗したあと、やり直すまで待つ時間
export const SHOP_CENTER_GRID_M = 250 // お店の問い合わせに送る中心を丸める世界固定のマスの一辺
export const MATCH_DISTANCE_M = 40 // 地図のお店とホットペッパーのお店を同じ店とみなす最大距離
export const CHECKIN_M = 50 // チェックインできる距離（サーバーの CHECKIN_M と同じ）
export const MAP_SHOPS_REEXTRACT_M = 100 // 地図のお店を読み直す移動距離
export const IN_FOG_VISIBLE_M = 50 // 霧の中でも、この距離以内なら店を出す
// ビル（同じ建物に複数のお店）
export const BUILDING_MAX_SIZE_M = 22 // ビルの大きさの上限（1軒の店より少し大きくてよい）
export const BUILDING_SAME_M = 1 // 輪郭に合わせた中心がこれ未満なら同じ建物
export const BUILDING_CENTER_RISE_RATE = 0.9 // ビルの当たりの中心は根元より大きさ × これ（m）上
export const BUILDING_TOP_RATE = 1.3 // ビルの屋根の高さ = 大きさ × これ（m）。ピンはここに立てる
export const PIN_HEAD_PX = 30 // ピン1つの幅（縮める前）
export const PIN_FIT_RATE = 0.9 // ピンの列をビルの幅のこの割合に収める
export const PIN_MIN_SCALE = 0.3 // 遠くでもこれより小さくしない
export const PIN_GAP_PX = 34 // ビルの上のピンの横の間隔
export const PIN_COLLAPSE_ZOOM = 16 // これより縮小したらピンを1つ＋「済み/全部」にまとめる
export const PIN_MAX_SPREAD = 5 // 小さいビルでピンを並べる最大の数（これより多ければ5つ＋「+N」）
export const FACILITY_MIN_AREA_M2 = 2500 // 輪郭がこれ以上の広さで2軒以上なら大型の施設（本人 OK 2026-11-07）
