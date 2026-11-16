// 効果音の決まり（A6。設計 docs/superpowers/specs/2026-11-16-sound-design.md）。
// どの場面でどの音をどの順に鳴らすかと、設定の読み取り。音を鳴らすのは infra/sound.ts。

export type SfxName = 'start' | 'checkin' | 'fog-clear' | 'coin' | 'levelup' | 'achieve' | 'town-clear' | 'reveal' | 'tap'
export type Cue = { name: SfxName; atMs: number }
export type SoundPrefs = { bgm: boolean; sfx: boolean }

// チェックイン: ファンファーレ → 霧の波 → コイン → Lv アップ（紙ふぶきと帯の出方に合わせた間）
export function checkinCues({ coins, levelUp }: { coins: number; levelUp: number | null }): Cue[] {
  const cues: Cue[] = [{ name: 'checkin', atMs: 0 }, { name: 'fog-clear', atMs: 450 }]
  if (coins > 0) cues.push({ name: 'coin', atMs: 1100 })
  if (levelUp !== null) cues.push({ name: 'levelup', atMs: 1500 })
  return cues
}

export function townCues(coins: number): Cue[] {
  return coins > 0 ? [{ name: 'town-clear', atMs: 0 }, { name: 'coin', atMs: 1500 }] : [{ name: 'town-clear', atMs: 0 }]
}

export function missionCues(): Cue[] {
  return [{ name: 'achieve', atMs: 0 }, { name: 'coin', atMs: 800 }]
}

export function parsePrefs(raw: string | null): SoundPrefs {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<SoundPrefs>) : {}
    return { bgm: v.bgm !== false, sfx: v.sfx !== false }
  } catch {
    return { bgm: true, sfx: true }
  }
}
