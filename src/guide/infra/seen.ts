// 案内を見たかどうか（端末ごと・人ごと。localStorage `mogumo.tutorial.<userId>`）
import { guideKey } from '../domain/guide.ts'

export function guideSeen(userId: string): boolean {
  try {
    return localStorage.getItem(guideKey(userId)) === '1'
  } catch {
    return true // 保存場所が使えない端末では、毎回出さない
  }
}

export function markGuideSeen(userId: string) {
  try {
    localStorage.setItem(guideKey(userId), '1')
  } catch {
    /* 保存できなくても続ける */
  }
}
