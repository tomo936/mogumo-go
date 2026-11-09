// 天からの地図。晴れた場所のマスを、真上から見た形で、やわらかい光として描く。
// スライダーの日付 t が進むと、晴れたマスから順にふわっと明るくなる。
import { useEffect, useRef } from 'react'
import { alphaAt, type ClearedCell } from '../domain/timeline.ts'

const SIZE = 640 // 描く大きさ（px）。CSS で幅いっぱいに縮める
const PAD = 40

type Props = { cells: ClearedCell[]; t: number; fadeMs: number }

export function TopDownMap({ cells, t, fadeMs }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, SIZE, SIZE)
    // 霧の台紙
    const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE)
    bg.addColorStop(0, '#dfe3dc')
    bg.addColorStop(1, '#cfd5cc')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, SIZE, SIZE)
    if (cells.length === 0) return
    // 全体が入る大きさにそろえる（スライダーを動かしても、地図の大きさは変えない）
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const c of cells) {
      if (c.x < minX) minX = c.x
      if (c.x > maxX) maxX = c.x
      if (c.y < minY) minY = c.y
      if (c.y > maxY) maxY = c.y
    }
    const span = Math.max(maxX - minX + 1, maxY - minY + 1, 12)
    const s = (SIZE - PAD * 2) / span
    const ox = PAD + ((span - (maxX - minX + 1)) * s) / 2
    const oy = PAD + ((span - (maxY - minY + 1)) * s) / 2
    for (const c of cells) {
      const a = alphaAt(c.at, t, fadeMs)
      if (a <= 0) continue
      const cx = ox + (c.x - minX + 0.5) * s
      const cy = oy + (maxY - c.y + 0.5) * s // 北が上
      const r = s * 2.4
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0, `rgba(255, 246, 196, ${0.85 * a})`)
      g.addColorStop(0.55, `rgba(250, 232, 160, ${0.45 * a})`)
      g.addColorStop(1, 'rgba(250, 232, 160, 0)')
      ctx.fillStyle = g
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    }
  }, [cells, t, fadeMs])
  return <canvas ref={ref} className="rc-map" width={SIZE} height={SIZE} role="img" aria-label="晴れた場所を真上から見た地図" />
}
