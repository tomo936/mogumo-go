// メニューの丸を開いたときに、5つの丸を扇状（上向き）に並べる位置。純粋な計算。
// 中心 (cx, cy) から半径 radius の円の上に、角度 startDeg→endDeg（左→右）で等間隔に置く（0°が右、90°が真上）
export function fanPositions(count: number, cx: number, cy: number, radius: number, startDeg = 165, endDeg = 15): { x: number; y: number }[] {
  if (count <= 0) return []
  if (count === 1) return [{ x: cx, y: cy - radius }]
  return Array.from({ length: count }, (_, i) => {
    const deg = startDeg + ((endDeg - startDeg) * i) / (count - 1)
    const rad = (deg * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) }
  })
}
