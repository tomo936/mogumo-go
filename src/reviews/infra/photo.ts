// 写真を canvas で JPEG に描き直して縮める（位置などの情報は描き直しで消える）。jsdom では動かない。
import { FIRST_ATTEMPT, fitSize, nextAttempt, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE } from '../domain/photoFit.ts'

export async function compressPhoto(file: Blob): Promise<Blob> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('photo_unusable')
  }
  try {
    const base = fitSize(bmp.width, bmp.height, PHOTO_MAX_SIDE)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('photo_unusable')
    for (let a: { quality: number; scale: number } | null = FIRST_ATTEMPT; a; a = nextAttempt(a)) {
      const w = Math.max(1, Math.round(base.w * a.scale))
      const h = Math.max(1, Math.round(base.h * a.scale))
      canvas.width = w
      canvas.height = h
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bmp, 0, 0, w, h)
      const q = a.quality
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q))
      if (blob && blob.size <= PHOTO_MAX_BYTES) return blob
    }
    throw new Error('photo_unusable')
  } finally {
    bmp.close()
  }
}
