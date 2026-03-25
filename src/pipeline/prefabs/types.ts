import type * as THREE from 'three/webgpu';

/**
 * A prefab stores the generated geometry + material for a scene object,
 * allowing it to be reused across multiple placements without regeneration.
 */
export interface Prefab {
  /** Unique identifier — matches the object id or prefabs map key */
  id: string;
  /** Original prompt that generated this prefab */
  prompt: string;
  /** Style used during generation */
  style: string;
  /** Generated geometry (shared across all instances) */
  geometry: THREE.BufferGeometry;
  /** Generated material (shared across all instances) */
  material: THREE.Material;
  /** Generator metadata (vertex count, face count, generation time) */
  metadata?: {
    vertexCount: number;
    faceCount: number;
    generator: string;
    generationTime: number;
  };
}
