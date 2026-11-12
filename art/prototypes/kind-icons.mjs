// 図鑑のタブ・札に使う「種類の食べ物の絵」（ピンの枠なし）。実行: node art/prototypes/kind-icons.mjs
// 元はミシェーラのアイコン art/pins/icons/pin-<種類>.png（約 1400px・透明）。絵の外形で切り詰め、
// 正方形の真ん中に置いて 96×96 にし、src/assets/kinds/<種類>.webp に出す（sweets→cake、other→mystery）。ffmpeg が要る。
import { execFileSync } from 'child_process'
import { mkdirSync } from 'fs'

const KINDS = 'ramen sushi soba washoku izakaya chinese yakiniku western curry cafe sweets bakery other donburi burger ethnic okonomiyaki takoyaki'.split(' ')
const OUT = 96
const ALPHA = 16
const raw = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 30 })
const size = (f) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number)

mkdirSync('src/assets/kinds', { recursive: true })
for (const k of KINDS) {
  const icon = `art/pins/icons/pin-${k}.png`
  const [W, H] = size(icon)
  const b = raw(icon)
  let x0 = W, x1 = 0, y0 = H, y1 = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (b[(y * W + x) * 4 + 3] > ALPHA) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh)
  const name = k === 'sweets' ? 'cake' : k === 'other' ? 'mystery' : k
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', icon, '-filter_complex',
    `[0]crop=${bw}:${bh}:${x0}:${y0},pad=${side}:${side}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,scale=${OUT}:${OUT}:flags=lanczos`,
    '-frames:v', '1', '-c:v', 'libwebp', '-q:v', '90', `src/assets/kinds/${name}.webp`])
  console.log(name)
}
