// ピンの合成（アプリの外で一度だけ行う）。実行: node art/prototypes/compose-pins.mjs
// 枠 art/pins/frames/pin-<種類>.png（512×512）に、アイコン art/pins/icons/pin-<種類>.png を重ね、
// 128×128 にして src/assets/pins/<種類>.png に出す（sweets は cake.png）。ffmpeg が要る。
//
// 使った数値（枠19枚すべて同じ形。白い丸を実際に測った 2026-11-09）
//   白い丸 = 横 x 98〜414、縦 y 64〜384 → 中心 (256, 224)、直径 約 319、半径 約 159.5（512px 基準）
//   アイコン = 透明部分を除いた外形の中心を丸の中心に合わせ、外形の中心からいちばん遠い点が
//   半径の 88%（約 140px）に収まる大きさに縮める（丸の内側に約 12% の余白）。
//   アイコンはどれも大きな画像（約 1300〜1500px）で、絵の外形の形がまちまちなので、1枚ごとに測って縮める。
import { execFileSync } from 'child_process'

// 引数 cluster: まとめのピンの台（その他の絵を 256px で src/assets/pins/cluster-base.png に。2026-11-13）
const CLUSTER = process.argv[2] === 'cluster'
const KINDS = CLUSTER ? ['other'] : 'ramen sushi soba washoku izakaya chinese yakiniku western curry cafe sweets bakery mystery other donburi burger ethnic okonomiyaki takoyaki'.split(' ')
const CX = 256, CY = 224, R = 159.5, FIT = 0.88, OUT = CLUSTER ? 256 : 128
const ALPHA = 16 // これより濃い点を絵とみなす

const raw = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 30 })
const size = (f) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number)

for (const k of KINDS) {
  const icon = `art/pins/icons/pin-${k}.png`
  const [W, H] = size(icon)
  const b = raw(icon)
  let x0 = W, x1 = 0, y0 = H, y1 = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (b[(y * W + x) * 4 + 3] > ALPHA) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  let m = 0
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (b[(y * W + x) * 4 + 3] > ALPHA) m = Math.max(m, Math.hypot(x - cx, y - cy))
  const s = (R * FIT) / m
  const w = Math.round(bw * s), h = Math.round(bh * s)
  const ox = Math.round(CX - w / 2), oy = Math.round(CY - h / 2)
  const name = CLUSTER ? 'cluster-base' : k === 'sweets' ? 'cake' : k
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `art/pins/frames/pin-${k}.png`, '-i', icon, '-filter_complex',
    `[1]crop=${bw}:${bh}:${x0}:${y0},scale=${w}:${h}:flags=lanczos[i];[0][i]overlay=${ox}:${oy}:format=auto,scale=${OUT}:${OUT}:flags=lanczos`,
    '-frames:v', '1', `src/assets/pins/${name}.png`])
  console.log(name, `縮小 ${s.toFixed(3)} 絵 ${w}x${h} 置き ${ox},${oy}`)
}
