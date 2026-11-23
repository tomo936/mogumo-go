// 共有の画像（2026-11-24 B-21 の答え「感想の文と画像つきで、このアプリ独自の見た目の画像で共有したい」）の決まり。
// 絵の主役は自分の写真（無ければ種類の絵）。ホットペッパーの写真は使わない（よその画像を画像として配ることになり、
// 出典の表示も要るため。また別のドメインの画像はキャンバスに描くと画像として取り出せない）。
export const CARD_W = 1080
export const CARD_H = 1350 // 4:5（SNS で切られにくい縦長）

export type ShareCardInput = {
  shopName: string
  kindLabel: string | null
  visits: number
  stars: number | null // 自分の感想の星（無ければ null）
  comment: string | null // 自分の感想のひとこと
  photo: 'own' | 'kind' // 主役の絵
}

export const starLine = (n: number) => '★★★★★'.slice(0, Math.max(0, Math.min(5, n))) + '☆☆☆☆☆'.slice(0, 5 - Math.max(0, Math.min(5, n)))

// 文を、幅に収まるように行に分ける（日本語は 1 字ずつ折る）。行が maxLines を超えたら最後の行を「…」で終える
export function wrapLines(text: string, maxWidth: number, maxLines: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const ch of text.replace(/\s+/g, ' ').trim()) {
    if (measure(cur + ch) > maxWidth && cur) {
      lines.push(cur)
      cur = ch
      if (lines.length === maxLines) break
    } else cur += ch
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  const used = lines.join('').length
  const total = text.replace(/\s+/g, ' ').trim().length
  if (used < total && lines.length > 0) {
    let last = lines[lines.length - 1]
    while (last && measure(last + '…') > maxWidth) last = last.slice(0, -1)
    lines[lines.length - 1] = last + '…'
  }
  return lines
}

export const visitText = (n: number) => (n >= 2 ? `${n}回目の来店` : 'はじめての来店')
