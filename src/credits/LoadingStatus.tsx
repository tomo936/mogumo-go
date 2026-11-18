import { useEffect } from 'react'
import { loading } from './loadingGate.ts'

// 行き先を決めている途中の「読み込み中…」。出ているあいだは、起動時のタイトルを閉じない（loadingGate の hold）
export function LoadingStatus() {
  useEffect(() => loading.hold(), [])
  return <p className="status">読み込み中…</p>
}
