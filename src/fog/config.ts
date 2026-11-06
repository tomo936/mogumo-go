// 霧・雲・海の調整値。何も import しない。
export const CELL_M = 25 // 霧のセルの一辺
export const REF_LAT_DEG = 35 // セルの経度幅を決める基準緯度
export const HOME_CLEAR_RADIUS_M = 200 // 自宅まわりの最初から晴れている半径
export const CLOUD_GAP_M = 60 // 雲スポットの間隔
export const CLOUD_REACH_M = 1500 // 雲を出す範囲の半径
export const CLOUD_CLEAR_MARGIN_M = 45 // 晴れたセルからこの距離以内の雲は出さない
export const CLOUD_CHUNK_M = 300 // 雲スポットを作る区画の一辺
export const SEA_HALF_M = 1500 // 雲海の半幅
export const SEA_REBUILD_M = 700 // 雲海を作り直す移動距離
export const SEA_TILE_M = 320 // 雲海タイルの一辺
