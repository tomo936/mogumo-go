import { expect, test } from 'vitest'
import * as THREE from 'three'
import { cull } from './instanceCull.ts'
import type { CullGroup } from './instanceCull.ts'

// 原点から -z を向くカメラ（奥の面 100）。前の 2 軒（20m・90m）だけ描き、後ろ（+z）と奥の面の先（150m）は描かない
test('見える範囲に入る軒だけを先頭に詰め、押したときの店も詰めた番号で引ける（2026-11-24）', () => {
  const cam = new THREE.PerspectiveCamera(60, 1, 1, 100)
  cam.updateMatrixWorld()
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
  const at = [-20, 30, -90, -150] // z
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), at.length)
  const g: CullGroup<string> = {
    meshes: [mesh],
    full: [at.map((z) => new THREE.Matrix4().makeTranslation(0, 0, z))],
    spheres: at.map((z) => new THREE.Sphere(new THREE.Vector3(0, 0, z), 2)),
    items: ['a', 'behind', 'b', 'far'],
    shown: '',
  }
  expect(cull(g, frustum)).toBe(true)
  expect(mesh.count).toBe(2)
  expect(mesh.userData.shops).toEqual(['a', 'b'])
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(1, m)
  expect(new THREE.Vector3().setFromMatrixPosition(m).z).toBe(-90)
  expect(cull(g, frustum)).toBe(false) // 同じなら書き直さない
  // 押したとき: 詰めたあとの模型に当たり、その番号で正しい店を引ける（90m 先の b）
  mesh.computeBoundingSphere()
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, -50), new THREE.Vector3(0, 0, -1))
  const h = ray.intersectObject(mesh)[0]
  expect((mesh.userData.shops as string[])[h.instanceId!]).toBe('b')
})
