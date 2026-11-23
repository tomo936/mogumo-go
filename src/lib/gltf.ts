// 模型（glb）を読む部品。meshopt で縮めた模型も読めるようにする（2026-11-23 軽量化。縮めていない模型もそのまま読める）
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

export function gltfLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
}
