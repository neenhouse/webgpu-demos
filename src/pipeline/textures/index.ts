import type * as THREE from 'three/webgpu';
import { float } from 'three/tsl';
import type { TextureDef } from './types.ts';
import { multiOctaveNoise } from './procedural.ts';

// Re-export types and procedural generators
export type { TextureDef } from './types.ts';
export {
  hashNoise,
  multiOctaveNoise,
  fbmNoise,
  checkerboard,
  stripes,
  brick,
  woodGrain,
  rustPatches,
  dirtAccumulation,
} from './procedural.ts';

/**
 * Resolve a TextureDef and apply procedural textures to a material.
 *
 * @param def - Texture definition from the scene spec
 * @param mat - Material to apply textures to
 */
export function resolveTextures(def: TextureDef, mat: THREE.MeshStandardNodeMaterial): void {
  const source = def.source ?? 'procedural';

  if (source === 'file') {
    // TODO: File-based textures are a future feature
    console.warn('[textures] File-based texture loading not yet implemented');
    return;
  }

  if (source === 'ai-generated') {
    // TODO: AI-generated textures are Phase 2
    console.warn('[textures] AI-generated textures not yet implemented');
    return;
  }

  // Procedural texture application
  if (source === 'procedural') {
    // Apply procedural noise to roughness variation and subtle color variation
    const noise = multiOctaveNoise();

    // Apply tiling by scaling UV coordinates
    // Note: tiling is handled per-generator in future; for now we apply
    // procedural noise based on position (not UV) so tiling doesn't affect it

    // Subtle roughness variation from noise
    if (!mat.roughnessNode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mat.roughnessNode = float(0.5).add((noise as any).mul(0.2));
    }

    // Future: parse def.prompt to select appropriate procedural generators
    // Future: apply tiling with vec2(tiling[0], tiling[1]).mul(uv())
  }
}
