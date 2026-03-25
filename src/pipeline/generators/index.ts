import * as THREE from 'three/webgpu';
import { ERROR_MARKER_COLOR } from './types.ts';
import type { Generator, GeneratorResult, SceneObject } from './types.ts';

const generators: Generator[] = [];

export function registerGenerator(generator: Generator): void {
  generators.push(generator);
}

export function getGenerators(): readonly Generator[] {
  return generators;
}

export function selectGenerator(object: SceneObject): Generator | null {
  // Hint-based selection
  if (object.generator) {
    const hinted = generators.find(
      (g) =>
        g.name === object.generator || object.generator?.startsWith(g.name),
    );
    if (hinted && hinted.canHandle(object) > 0) {
      return hinted;
    }
  }

  // Confidence-based selection
  let best: Generator | null = null;
  let bestConfidence = 0;
  for (const gen of generators) {
    const confidence = gen.canHandle(object);
    if (confidence > bestConfidence) {
      best = gen;
      bestConfidence = confidence;
    }
  }
  return best;
}

export function generateObject(object: SceneObject): GeneratorResult {
  const generator = selectGenerator(object);

  if (!generator) {
    console.warn(
      `No generator found for object "${object.id}" (prompt: "${object.prompt}")`,
    );
    return createErrorMarker(object);
  }

  try {
    return generator.generate(object);
  } catch (err) {
    console.error(
      `Generator "${generator.name}" failed for object "${object.id}":`,
      err,
    );
    return createErrorMarker(object);
  }
}

function createErrorMarker(object: SceneObject): GeneratorResult {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: ERROR_MARKER_COLOR,
    wireframe: true,
  });
  return {
    geometry,
    material,
    metadata: {
      vertexCount: geometry.attributes.position.count,
      faceCount: geometry.index ? geometry.index.count / 3 : 0,
      generator: 'error-marker',
      prompt: object.prompt,
      generationTime: 0,
    },
  };
}
