// 共有の画像を canvas で描く（2026-11-24 B-21）。決まりは domain/shareCard.ts
import { CARD_H, CARD_W, starLine, visitText, wrapLines, type ShareCardInput } from '../domain/shareCard.ts'
import { APP_URL } from '../domain/shareText.ts'

const FONT = '"M PLUS Rounded 1c", sans-serif'
const INK = '#4a2f18'
const BODY = '#5a3a1e'
const OUTLINE = '#7a4a26'
const ACCENT = '#c2652a'

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.crossOrigin = 'anonymous' // 自分の写真（Supabase の期限付き URL）はよそのドメインなので、取り出せるように
    i.onload = () => res(i)
    i.onerror = rej
    i.src = src
  })

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

// photoUrl: 自分の写真（input.photo が 'own'）か種類の絵の URL
export async function drawShareCard(input: ShareCardInput, photoUrl: string): Promise<Blob> {
  // 丸い字体は使う字だけを読み込むので、絵に描く文をそのまま渡して読み込ませる（足りない字が別の字体になるのを防ぐ）
  const all = `${input.shopName}${input.kindLabel ?? ''}${visitText(input.visits)}${input.comment ?? ''}「」…もぐもGO${APP_URL}0123456789`
  await Promise.all(['800 64px', '700 34px', '500 38px', '800 52px', '700 28px'].map((f) => document.fonts?.load(`${f} ${FONT}`, all).catch(() => [])))
  const cv = document.createElement('canvas')
  cv.width = CARD_W
  cv.height = CARD_H
  const c = cv.getContext('2d')
  if (!c) throw new Error('no canvas')

  // 地: 手帳のクリーム、真ん中に白いカード（こげ茶の縁・うすい影）
  c.fillStyle = '#f3e9d6'
  c.fillRect(0, 0, CARD_W, CARD_H)
  const X = 56, Y = 56, W = CARD_W - 112, H = CARD_H - 112
  c.save()
  c.shadowColor = 'rgba(90, 60, 30, 0.22)'
  c.shadowBlur = 30
  c.shadowOffsetY = 10
  roundRect(c, X, Y, W, H, 48)
  c.fillStyle = '#fffdf7'
  c.fill()
  c.restore()
  c.lineWidth = 6
  c.strokeStyle = OUTLINE
  roundRect(c, X, Y, W, H, 48)
  c.stroke()

  // 主役の絵（上）
  const PX = X + 36, PY = Y + 36, PW = W - 72, PH = 620
  c.save()
  roundRect(c, PX, PY, PW, PH, 32)
  c.clip()
  c.fillStyle = '#fffaf0'
  c.fillRect(PX, PY, PW, PH)
  try {
    const img = await loadImage(photoUrl)
    if (input.photo === 'own') {
      const s = Math.max(PW / img.width, PH / img.height) // 写真は枠いっぱいに
      c.drawImage(img, PX + (PW - img.width * s) / 2, PY + (PH - img.height * s) / 2, img.width * s, img.height * s)
    } else {
      const s = Math.min((PH * 0.88) / img.height, (PW * 0.7) / img.width, 1.5) // 図鑑のカードの絵（お店の建物）を真ん中に。ぼやけないよう拡大は 1.5 倍まで
      c.drawImage(img, PX + (PW - img.width * s) / 2, PY + (PH - img.height * s) / 2, img.width * s, img.height * s)
    }
  } catch {
    /* 絵が読めなければ地の色のまま */
  }
  c.restore()
  c.lineWidth = 4
  c.strokeStyle = OUTLINE
  roundRect(c, PX, PY, PW, PH, 32)
  c.stroke()

  // 店名（2 行まで）
  let y = PY + PH + 92
  c.fillStyle = INK
  c.font = `800 64px ${FONT}`
  for (const line of wrapLines(input.shopName, PW, 2, (s) => c.measureText(s).width)) {
    c.fillText(line, PX, y)
    y += 76
  }

  // 種類の札・来店の回数・星
  y += 6
  c.font = `700 34px ${FONT}`
  let x = PX
  if (input.kindLabel) {
    const w = c.measureText(input.kindLabel).width + 44
    roundRect(c, x, y - 40, w, 54, 27)
    c.fillStyle = '#fff7ee'
    c.fill()
    c.lineWidth = 3
    c.strokeStyle = '#e8a26b'
    c.stroke()
    c.fillStyle = '#a2561b'
    c.fillText(input.kindLabel, x + 22, y)
    x += w + 20
  }
  c.fillStyle = BODY
  c.fillText(visitText(input.visits), x, y)
  if (input.stars !== null) {
    c.font = `700 44px ${FONT}`
    c.fillStyle = '#e0a000'
    const st = starLine(input.stars)
    c.fillText(st, PX + PW - c.measureText(st).width, y + 2)
  }

  // 感想のひとこと（3 行まで）
  if (input.comment) {
    y += 70
    c.font = `500 38px ${FONT}`
    c.fillStyle = BODY
    for (const line of wrapLines(`「${input.comment}」`, PW, 3, (s) => c.measureText(s).width)) {
      c.fillText(line, PX, y)
      y += 54
    }
  }

  // アプリの名前とリンク（下）
  c.font = `800 52px ${FONT}`
  c.fillStyle = ACCENT
  c.fillText('もぐもGO', PX, Y + H - 56)
  c.font = `700 28px ${FONT}`
  c.fillStyle = '#8a6a48'
  const url = APP_URL.replace('https://', '')
  c.fillText(url, PX + PW - c.measureText(url).width, Y + H - 62)

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'))
}
