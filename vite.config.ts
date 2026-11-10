import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
// 画面（設定のバージョン）に出す、どの版を組み立てたかの印。Vercel は組み立て時に VERCEL_GIT_COMMIT_SHA を渡す
const buildId = (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  assetsInclude: ['**/*.glb'],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
  },
})
