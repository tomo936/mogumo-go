import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// maplibre-gl 6 は既定では自分のファイルの隣にワーカーを探すが、Vite の開発サーバーでも
// ビルド後でもそこには置かれない。ワーカーのファイルを素材として出力させ、その URL を教える
setWorkerUrl(workerUrl)
