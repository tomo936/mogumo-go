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

// 画像ごと共有する（2026-11-24 B-21）。画像を送れる端末はスマホの共有の画面、送れない端末は画像を保存する。
// iPhone は「押した直後」でないと共有の画面を出せないので、画像は押す前に作っておき、ここでは待たずに呼ぶ
export async function shareImage(blob: Blob, t: { title: string; text: string; url: string }, nav: Navigator = navigator): Promise<ShareResult | 'saved'> {
  const file = new File([blob], 'mogumo-go.png', { type: 'image/png' })
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: t.title, text: `${t.text}\n${t.url}` })
      return 'shared'
    } catch (e) {
      return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed'
    }
  }
  try {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'mogumo-go.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    return 'saved'
  } catch {
    return 'failed'
  }
}
