import { createRoot } from 'react-dom/client'
import './index.css'
import { boot } from './boot.tsx'
import { debugOn } from './map/ui/debugOverlay.ts'

// ?debug は、ログインの行き来で URL から消える前に覚えておく（測る表示）
debugOn(window.location.search)

void boot(
  createRoot(document.getElementById('root')!),
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
