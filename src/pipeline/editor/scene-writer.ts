import { stringify } from 'yaml';
import type { Scene } from '../spec/types';

/**
 * Serialize a Scene object to a YAML string.
 *
 * Uses block scalar style for multi-line strings (prompts, shaders)
 * and flow style for short arrays like Vec3 tuples so the output
 * stays readable and git-diff friendly.
 */
export function writeScene(scene: Scene): string {
  return stringify(scene, {
    // Use block scalars for multi-line strings (prompts, shader code)
    blockQuote: 'literal',
    // Default flow level — only inline short leaf arrays (Vec3, ranges)
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN',
    lineWidth: 120,
    // Custom replacer to keep Vec3 tuples on one line
    toStringDefaults: {
      // Flow style for short arrays (3 or fewer numbers)
      collectionStyle: 'any',
    },
  });
}
