// 共有の文（2026-11-24 B-19「共有」）。アプリのリンクを必ず入れる（依頼 2026-11-23-uiux-security-release.md の 3）
export const APP_URL = 'https://mogumo-go.vercel.app'

export type ShareInput = { shopName: string; kindLabel: string | null; visits: number }

export type ShareText = { title: string; text: string; url: string }

// 図鑑のカードを共有する文。回数は 2 回目から入れる（1 回目は「行った」だけ）
export function zukanShareText({ shopName, kindLabel, visits }: ShareInput): ShareText {
  const kind = kindLabel ? `（${kindLabel}）` : ''
  const times = visits >= 2 ? `${visits}回目の` : ''
  return {
    title: 'もぐもGO',
    text: `${shopName}${kind}に${times}チェックインしたよ。霧を晴らしてまちのおいしいお店を集めよう #もぐもGO`,
    url: APP_URL,
  }
}

// 共有の画面が使えない端末でコピーする 1 つの文（文のあとに改行してリンク）
export function shareClipboardText(t: ShareText): string {
  return `${t.text}\n${t.url}`
}
