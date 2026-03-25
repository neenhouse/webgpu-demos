import type { Generator, GeneratorResult, SceneObject } from '../types.ts';
import { terrainGenerator } from './terrain.ts';
import { rockGenerator } from './rock.ts';
import { vegetationGenerator } from './vegetation.ts';

const parametricGenerators: Generator[] = [
  terrainGenerator,
  rockGenerator,
  vegetationGenerator,
];

export function registerParametricGenerator(generator: Generator): void {
  parametricGenerators.push(generator);
}

/**
 * Meta-generator that delegates to the best parametric sub-generator.
 * Returns the max confidence from its sub-generators.
 */
export const parametricGenerator: Generator = {
  name: 'parametric',

  canHandle(object: SceneObject): number {
    let maxConfidence = 0;
    for (const gen of parametricGenerators) {
      const confidence = gen.canHandle(object);
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
      }
    }
    return maxConfidence;
  },

  generate(object: SceneObject): GeneratorResult {
    // Find the best sub-generator
    let best: Generator | null = null;
    let bestConfidence = 0;
    for (const gen of parametricGenerators) {
      const confidence = gen.canHandle(object);
      if (confidence > bestConfidence) {
        best = gen;
        bestConfidence = confidence;
      }
    }

    if (!best) {
      throw new Error('No parametric sub-generator found');
    }

    return best.generate(object);
  },
};
