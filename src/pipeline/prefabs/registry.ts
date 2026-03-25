import * as THREE from 'three/webgpu';
import type { Transform } from '../spec/types';
import type { Prefab } from './types';

export class PrefabRegistry {
  private readonly prefabs = new Map<string, Prefab>();

  register(id: string, prefab: Prefab): void {
    if (this.prefabs.has(id)) {
      throw new Error(`Prefab "${id}" is already registered. Call clear() before re-registering.`);
    }
    this.prefabs.set(id, prefab);
  }

  get(id: string): Prefab | undefined {
    return this.prefabs.get(id);
  }

  has(id: string): boolean {
    return this.prefabs.has(id);
  }

  list(): string[] {
    return Array.from(this.prefabs.keys());
  }

  clear(): void {
    this.prefabs.clear();
  }

  /**
   * Creates a THREE.InstancedMesh from a registered prefab and an array of transforms.
   * Follows the proven InstancedMesh pattern from existing demos (particle-field, cyber-city, sprite-sparks).
   */
  instantiate(id: string, transforms: Transform[]): THREE.InstancedMesh {
    const prefab = this.prefabs.get(id);
    if (!prefab) {
      throw new Error(`Prefab "${id}" not found in registry`);
    }

    const mesh = new THREE.InstancedMesh(prefab.geometry, prefab.material, transforms.length);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];

      dummy.position.set(t.position[0], t.position[1], t.position[2]);
      dummy.rotation.set(
        t.rotation[0] * THREE.MathUtils.DEG2RAD,
        t.rotation[1] * THREE.MathUtils.DEG2RAD,
        t.rotation[2] * THREE.MathUtils.DEG2RAD,
      );

      const s = t.scale;
      if (typeof s === 'number') {
        dummy.scale.setScalar(s);
      } else {
        dummy.scale.set(s[0], s[1], s[2]);
      }

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}
