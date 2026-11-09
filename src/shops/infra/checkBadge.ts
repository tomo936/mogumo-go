// ピンの絵の右上に、緑の丸に白い ✓ の印を重ねた絵を作る（済みの店のピン用）。
// canvas が使えない環境（テストなど）では null。

const GREEN = '#3ecf8e'

export function checkBadgeImage(src: CanvasImageSource & { width: number; height: number }): ImageData | null {
  const w = src.width
  const h = src.height
  if (!w || !h || typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(src, 0, 0)
  // 右上の角。丸の半径は絵の幅の 17%
  const r = w * 0.17
  const cx = w - r - w * 0.02
  const cy = r + h * 0.02
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2)
  ctx.fillStyle = GREEN
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = r * 0.28
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.38, cy + r * 0.02)
  ctx.lineTo(cx - r * 0.08, cy + r * 0.32)
  ctx.lineTo(cx + r * 0.4, cy - r * 0.28)
  ctx.stroke()
  return ctx.getImageData(0, 0, w, h)
}
