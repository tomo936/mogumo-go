// 共有する。スマホの共有の画面（Web Share）が使えればそれで、使えなければ文をコピーする
import { shareClipboardText } from '../domain/shareText.ts'
import type { ShareText } from '../domain/shareText.ts'

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

export async function shareOut(t: ShareText, nav: Navigator = navigator): Promise<ShareResult> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share(t)
      return 'shared'
    } catch (e) {
      // 共有の画面を閉じただけ（AbortError）は失敗にしない
      return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed'
    }
  }
  try {
    await nav.clipboard.writeText(shareClipboardText(t))
    return 'copied'
  } catch {
    return 'failed'
  }
}
