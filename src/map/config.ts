// 地図と位置追従の調整値。実機で触って変えるときはここだけを直す。
// タイルの出どころ（OpenFreeMap）は STYLE_URL の1か所で差し替える（SPEC §3.1）。
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'
export const PITCH = 55
export const MIN_ZOOM = 16
export const MAX_ZOOM = 18
export const INITIAL_ZOOM = 17
export const CIRCLE_RADIUS_M = 50
export const MAX_ACCURACY_M = 50
export const MAX_SPEED_MPS = 30
export const SNAP_GAP_MS = 10000
export const FOLLOW_TAU_MS = 400
export const FIRST_FIX_TIMEOUT_MS = 20000
export const ROTATE_DEG_PER_PX = 0.3
