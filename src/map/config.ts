// 地図と位置追従の調整値。実機で触って変えるときはここだけを直す。
// タイルの出どころ（OpenFreeMap）は STYLE_URL の1か所で差し替える（SPEC §3.1）。
// 土台は文字やお店の印が少ない positron。色は themes.ts の案を上から当てる
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
export const MAP_THEME: 'sky' | 'mint' | 'pop' = 'pop' // 本人が選択（2026-11-06）
export const PITCH = 55
export const MIN_ZOOM = 16
export const MAX_ZOOM = 18
export const INITIAL_ZOOM = 17
export const CIRCLE_RADIUS_M = 50
export const MAX_ACCURACY_M = 50
// 最初の1回だけはこの精度まで受け入れて地図を出す（屋内・PC の Wi-Fi 測位は 50m より粗いことが多い）
export const FIRST_FIX_MAX_ACCURACY_M = 2000
export const MAX_SPEED_MPS = 30
export const SNAP_GAP_MS = 10000
export const FOLLOW_TAU_MS = 400
export const FIRST_FIX_TIMEOUT_MS = 20000
export const ROTATE_DEG_PER_PX = 0.3
// 自分のアバター（お試し版）。ならした位置の速さ（m/秒）がこれを超えたら「歩いている」
export const AVATAR_WALK_SPEED_MPS = 0.4
export const AVATAR_SPEED_TAU_MS = 300 // 速さをならす時間（コマごとのぶれを消す）
export const AVATAR_MIN_MOVE_M = 0.5 // これ以上動いてから向きを更新する（止まりぎわのぶれで向きが回らないように）
export const AVATAR_FRAMES = 21
export const AVATAR_FPS = 14
export const AVATAR_HEIGHT_PX = 40 // 画面上の高さ（2026-11-09 本人「巨人かよ」で 64→40）
