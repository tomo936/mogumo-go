// ゲストに「Google をつないで記録を守ろう」と勧める節目（A3）。チェックイン 1・5・10 軒、そのあと 10 軒ごと。
// 同じ節目は二度出さない（last = 前に勧めた節目、まだなら 0）。設計 docs/superpowers/specs/2026-11-17-guest-login-design.md

// total 軒のときに出す節目（無ければ null）。total までに来た節目のうち一番大きいもので、前より大きいときだけ
export function nudgeMilestone(total: number, last: number): number | null {
  if (total < 1) return null
  const m = total < 5 ? 1 : total < 10 ? 5 : Math.floor(total / 10) * 10
  return m > last ? m : null
}
