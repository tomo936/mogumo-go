import { StrictMode } from 'react'
import type { Root } from 'react-dom/client'

import { CONFIG_ERROR } from './lib/config.ts'

// 設定が無いときは、アプリ本体（Supabase を読み込む）を読まずに文言だけ出す。
// 読み込んでしまうと、例外で真っ白になり、iPhone では原因が見えないため。
export async function boot(root: Root, url: string | undefined, key: string | undefined): Promise<void> {
  if (!url || !key) {
    root.render(<p className="status">{CONFIG_ERROR}</p>)
    return
  }
  const { App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
