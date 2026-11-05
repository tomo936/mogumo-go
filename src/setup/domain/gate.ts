export type SetupState = { hasProfile: boolean; hasHome: boolean }

// 足りない初回設定の画面。null なら地図へ進んでよい
export function nextSetupPath(s: SetupState): '/setup/name' | '/setup/home' | null {
  if (!s.hasProfile) return '/setup/name'
  if (!s.hasHome) return '/setup/home'
  return null
}
