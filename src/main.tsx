import { createRoot } from 'react-dom/client'
import './index.css'
import './ui/hitArea.css' // 押せる範囲を 44px 以上に（見た目は変えない）
import { boot } from './boot.tsx'
import { debugOn } from './map/ui/debugOverlay.ts'
import { installTapSound } from './sound/infra/sound.ts'

// ?debug は、ログインの行き来で URL から消える前に覚えておく（測る表示）
debugOn(window.location.search)
// ボタンを押したら「ぽこっ」（A6）
installTapSound()

void boot(
  createRoot(document.getElementById('root')!),
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
