import * as THREE from 'three/webgpu';
import type { Generator, GeneratorResult, SceneObject } from './types.ts';

/**
 * Tier 5: Tripo3D API adapter (stub).
 *
 * Will eventually send prompts to the Tripo3D API and receive .glb meshes
 * loaded via GLTFLoader. For now, returns a placeholder sphere and logs
 * a warning indicating the API is not yet configured.
 *
 * Scene YAML specifies `generator: tripo` with optional params:
 *   - api_prompt: string (may differ from display prompt)
 *   - cache_key: string (for local caching after first generation)
 */
export const tripoGenerator: Generator = {
  name: 'tripo',

  canHandle(object: SceneObject): number {
    // Only handles objects explicitly requesting Tripo
    if (object.generator === 'tripo') return 0.95;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();

    console.warn(
      '[tripo] Tripo3D not yet configured. Using placeholder geometry.',
    );

    // Return a sphere as a visible placeholder
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'tripo',
        prompt: object.prompt || '',
        generationTime: elapsed,
      },
    };
  },
};
