import * as THREE from 'three'
import { expect, test } from 'vitest'
import { lightUp } from './nightLook.ts'

test('夜は光る窓を強く、ガラス窓に暖かい明かり。昼に戻すと模型のまま（何度切りかえても同じ）', () => {
  const lamp = new THREE.MeshStandardMaterial({ color: '#f3d8a8', emissive: '#f3d8a8', emissiveIntensity: 1 })
  const glass = new THREE.MeshStandardMaterial({ color: '#c3d8f2' })
  const wall = new THREE.MeshStandardMaterial({ color: '#a2643d' })
  for (let i = 0; i < 2; i++) {
    lightUp([lamp, glass, wall], true)
    expect(lamp.emissiveIntensity).toBeGreaterThan(1)
    expect(glass.emissive.getHex()).not.toBe(0)
    expect(wall.emissive.getHex()).toBe(0)
    lightUp([lamp, glass, wall], false)
    expect(lamp.emissiveIntensity).toBe(1)
    expect(glass.emissive.getHex()).toBe(0)
  }
})
