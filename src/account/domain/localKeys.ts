// 退会のとき端末から消す localStorage のキー: アプリのもの（mogumo.）で、この人の user_id を含むもの。
// 音の設定など端末のもの（人に結びつかない）は残す
export function keysOfUser(keys: readonly string[], userId: string): string[] {
  return keys.filter((k) => k.startsWith('mogumo.') && k.includes(userId))
}
