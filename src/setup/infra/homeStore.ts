import { parseHome } from '../domain/home.ts'
import type { Home } from '../domain/home.ts'

// 自宅はアカウントごとに、この端末の中にだけ保存する（ログアウトしても消さない）
const key = (userId: string) => `mogumo.home.${userId}`

export function loadHome(userId: string, storage: Storage = localStorage): Home | null {
  try {
    return parseHome(storage.getItem(key(userId)))
  } catch {
    return null
  }
}

export function saveHome(userId: string, home: Home, storage: Storage = localStorage): void {
  try {
    storage.setItem(key(userId), JSON.stringify({ lat: home.lat, lng: home.lng }))
  } catch {
    // 保存できない端末（プライベートブラウズなど）では、次回また自宅を聞く
  }
}
