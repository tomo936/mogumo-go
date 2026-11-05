// 初回設定の途中の入力。リロードしても続きから入れるよう、このタブの中に一時保存する
export type SetupDraft = { nickname?: string; starterId?: 101 | 102 }

const KEY = 'mogumo.setupDraft'

export function loadDraft(storage: Storage = sessionStorage): SetupDraft {
  try {
    const v: unknown = JSON.parse(storage.getItem(KEY) ?? '{}')
    if (typeof v !== 'object' || v === null) return {}
    const d = v as Record<string, unknown>
    return {
      ...(typeof d.nickname === 'string' ? { nickname: d.nickname } : {}),
      ...(d.starterId === 101 || d.starterId === 102 ? { starterId: d.starterId } : {}),
    }
  } catch {
    return {}
  }
}

export function saveDraft(patch: SetupDraft, storage: Storage = sessionStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify({ ...loadDraft(storage), ...patch }))
  } catch {
    // 保存できなくても入力は画面に残る
  }
}

export function clearDraft(storage: Storage = sessionStorage): void {
  try {
    storage.removeItem(KEY)
  } catch {
    // 何もしない
  }
}
