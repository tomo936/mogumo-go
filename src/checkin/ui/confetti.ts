// 紙吹雪（canvas）。パステルの丸・四角・星が上に弾けて、ひらひら落ちる。React は使わない。
const COLORS = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff']
const COUNT = 90
const DURATION_MS = 1200
const GRAVITY = 900 // px/s^2

type Piece = {
  x: number; y: number; vx: number; vy: number
  size: number; color: string; shape: 'circle' | 'rect' | 'star'
  rot: number; vrot: number
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = (Math.PI / 5) * i - Math.PI / 2
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
  }
  ctx.closePath()
  ctx.fill()
}

// 返り値は止める関数。(originX, originY) はキャンバス上の弾ける位置（CSS px）
export function startConfetti(canvas: HTMLCanvasElement, originX: number, originY: number): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
  const shapes = ['circle', 'rect', 'star'] as const
  const pieces: Piece[] = Array.from({ length: COUNT }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1
    const speed = 350 + Math.random() * 550
    return {
      x: originX, y: originY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 7, color: COLORS[i % COLORS.length], shape: shapes[i % 3],
      rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 12,
    }
  })
  const start = performance.now()
  let prev = start
  let frame = 0
  const tick = (now: number) => {
    const t = now - start
    const dt = Math.min(0.05, (now - prev) / 1000)
    prev = now
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    if (t >= DURATION_MS) return
    const fade = t > DURATION_MS * 0.7 ? 1 - (t - DURATION_MS * 0.7) / (DURATION_MS * 0.3) : 1
    ctx.globalAlpha = Math.max(0, fade)
    for (const p of pieces) {
      p.vy += GRAVITY * dt
      p.vx *= 0.985
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vrot * dt
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.shape === 'circle') {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      } else {
        star(ctx, p.size * 0.7)
      }
      ctx.restore()
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}
