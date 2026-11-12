// 地図と位置追従の調整値。実機で触って変えるときはここだけを直す。
// タイルの出どころ（OpenFreeMap）は STYLE_URL の1か所で差し替える（SPEC §3.1）。
// 土台は文字やお店の印が少ない positron。色は themes.ts の案を上から当てる
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
export const MAP_THEME: 'sky' | 'mint' | 'pop' | 'illust' = 'illust' // イラスト調（2026-11-10 オーナー）。前は pop
export const PITCH = 55
export const MIN_ZOOM = 16
export const MAX_ZOOM = 18
export const INITIAL_ZOOM = 17
export const CIRCLE_RADIUS_M = 50
// 足元の範囲の波紋（A2、2026-11-12 オーナー「案1」）。波の色・1 周の時間・本数。塗りは範囲の目印として残す
export const RIPPLE_COLOR = '#ff8f45'
export const RIPPLE_FILL_COLOR = '#ff9f5a'
export const RIPPLE_FILL_OPACITY = 0.13
export const RIPPLE_PERIOD_MS = 2600
export const RIPPLE_COUNT = 2
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
export const AVATAR_HEIGHT_PX = 40 // 2D の男の子（3D が読めないときの代わり）の画面上の高さ（2026-11-09 本人「巨人かよ」で 64→40）
// 3D の男の子（段 7）。大きさは地図の上で固定（引けばお店と同じ割合で小さくなる。2026-11-11 オーナー）
export const AVATAR_HEIGHT_M = 20 // 身長（地図の上の m）。ズーム 17 で約 40px
export const AVATAR_MIN_PX = 16 // 画面でこれより小さくしない
export const AVATAR_RUN_SPEED_MPS = 2.0 // これ以上の速さは走り（SPEC の目安）。AVATAR_WALK_SPEED_MPS 以下は待機
export const AVATAR_MOTION_HOLD_MS = 1000 // 新しい速さがこれだけ続いてから動きを替える（行ったり来たりを防ぐ）
export const AVATAR_FADE_S = 0.25 // 動きを替えるときに混ぜる時間
// 歩き・走りの再生の速さ = 進む速さ ÷ 基準の速さ（基準の速さで 1 倍）。上下の範囲に収める。
// D12 の式（進む速さ ÷（歩幅 × 2 ÷ 周期））を身長 20m の体の歩幅で計算すると、歩き 1.4m/秒で約 0.2 倍になり
// 足がほとんど動かなく見えるので、基準の速さは見た目で決めた（2026-11-12 段 7）
export const AVATAR_WALK_REF_MPS = 1.2
export const AVATAR_RUN_REF_MPS = 3.0
export const AVATAR_RATE_MIN = 0.7
export const AVATAR_RATE_MAX = 1.4
export const AVATAR_JOY_PLAYS = 2 // うれしいの動き（1 回 0.8 秒）を何回
