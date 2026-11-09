// 店名を明かす判定（30m 以内）。一度明かしたら、その日は明かしたまま。
import { distanceMeters } from '../../map/domain/geo.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { HINT_REVEAL_M } from '../config.ts'
import type { DailyHint } from './hint.ts'

export function updateRevealed(
  prev: ReadonlySet<string>,
  hints: readonly DailyHint[],
  me: LatLng,
  posOf: (h: DailyHint) => LatLng,
): { revealed: Set<string>; newly: string[] } {
  const revealed = new Set(prev)
  const newly: string[] = []
  for (const h of hints) {
    if (revealed.has(h.id)) continue
    if (h.completed) {
      revealed.add(h.id) // 達成済みは明かした扱い。帯は出さない
    } else if (distanceMeters(me, posOf(h)) <= HINT_REVEAL_M) {
      revealed.add(h.id)
      newly.push(h.id)
    }
  }
  return { revealed, newly }
}
