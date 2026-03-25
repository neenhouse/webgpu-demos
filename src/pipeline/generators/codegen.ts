import * as THREE from 'three/webgpu';
import type { Generator, GeneratorResult, SceneObject } from './types.ts';

/**
 * Tier 4: AI Code Generation loader.
 *
 * Loads pre-generated factory functions from files created by Ralph.
 * Scene YAML specifies `generator: codegen` with `params.source` pointing
 * to a generated factory file (e.g., "generated/junkyard/victorian-lamp.ts").
 *
 * For now, returns a placeholder octahedron geometry so it is visually
 * distinguishable from other generators. When params.source is provided,
 * the factory function would be dynamically imported at runtime.
 */
export const codegenGenerator: Generator = {
  name: 'codegen',

  canHandle(object: SceneObject): number {
    // High confidence when explicitly requested
    if (object.generator === 'codegen') return 0.9;
    // Zero confidence otherwise -- codegen is only used when explicitly specified
    // via generator: codegen in the scene YAML
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();

    // When params.source exists, it would dynamically import that file:
    //   const factory = await import(source);
    //   return factory.default();
    // For now, return a placeholder octahedron so it's visually clear this is codegen
    const geometry = new THREE.OctahedronGeometry(0.5, 2);
    const elapsed = performance.now() - start;

    if (object.params?.source) {
      console.info(
        `[codegen] Would load factory from "${object.params.source}" — using placeholder geometry`,
      );
    }

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'codegen',
        prompt: object.prompt || '',
        generationTime: elapsed,
      },
    };
  },
};
