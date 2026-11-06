// 霧の調整値。何も import しない。
export const CELL_M = 25 // 霧のセルの一辺
export const REF_LAT_DEG = 35 // セルの経度幅を決める基準緯度
export const HOME_CLEAR_RADIUS_M = 200 // 自宅まわりの最初から晴れている半径
export const FOG_HALF_M = 1200 // 雲の塊を置く範囲の半幅（現在地から）
export const FOG_REBUILD_M = 700 // 雲の塊を置き直す移動距離
export const CLUMP_STEP_M = 30 // 雲の塊の格子の間隔（六角格子）
export const CLUMP_JITTER = 0.35 // 格子からのずれ（間隔に対する割合）
export const CLUMP_MIN_M = 24 // 塊の半幅の最小
export const CLUMP_MAX_M = 40 // 塊の半幅の最大
export const CLUMP_EDGE_M = 8 // 晴れたセルの中心から雲の端までの最小距離
export const FOG_RESORT_DEG = 2 // 地図がこれだけ回ったら重ね順を並べ直す
