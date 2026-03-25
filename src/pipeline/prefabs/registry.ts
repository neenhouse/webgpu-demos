import * as THREE from 'three/webgpu';
import type { Transform, SceneObject } from '../spec/types';
import type { GeneratorResult } from '../generators/types';
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

/**
 * After an object is generated, optionally register it as a prefab.
 * Call this after geometry generation for every object.
 */
export function maybeRegisterPrefab(
  registry: PrefabRegistry,
  object: SceneObject,
  result: GeneratorResult,
): void {
  if (object.register_prefab) {
    registry.register(object.id, {
      id: object.id,
      prompt: object.prompt,
      style: object.style ?? 'realistic',
      geometry: result.geometry,
      material: result.material ?? new THREE.MeshStandardNodeMaterial(),
      metadata: result.metadata,
    });
  }
}

/**
 * If an object references a prefab, look it up.
 * Returns the Prefab if found, undefined if no prefab_ref is set.
 * Logs a warning and returns undefined if the ref is set but not found
 * (matching spec: "Unknown prefab reference: skip the object, log error").
 */
export function lookupPrefab(
  registry: PrefabRegistry,
  object: SceneObject,
): Prefab | undefined {
  if (!object.prefab_ref) return undefined;

  const prefab = registry.get(object.prefab_ref);
  if (!prefab) {
    console.error(`[PrefabRegistry] Unknown prefab_ref "${object.prefab_ref}" on object "${object.id}" — skipping`);
    return undefined;
  }
  return prefab;
}
