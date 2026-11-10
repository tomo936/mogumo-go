/// <reference types="vite/client" />

declare module '*.glb' {
  const url: string
  export default url
}

// どの版を組み立てたか（vite.config.ts の define）。設定のバージョンに出す
declare const __BUILD_ID__: string
