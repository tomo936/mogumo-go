import { defineConfig } from 'vite'
// 撮影ページ用（リポジトリの根をそのまま配る。.env は読まない）
export default defineConfig({ root: '/home/otosa/mogumo-go', envDir: '/home/otosa/mogumo-go/art/characters/boy/scripts', server: { port: 5199, strictPort: true, watch: null }, assetsInclude: ['**/*.glb'] })
