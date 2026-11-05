import { createRoot } from 'react-dom/client'
import './index.css'
import { boot } from './boot.tsx'

void boot(
  createRoot(document.getElementById('root')!),
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
