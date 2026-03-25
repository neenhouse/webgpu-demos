import * as THREE from 'three/webgpu';
import { simplifyGeometry } from './simplifier';

// Re-export the types used in the public API
export interface LodLevelConfig {
  distance: number;
  detail: number; // 0-1, proportion of original detail
}

export interface LodConfig {
  mode: 'auto' | 'custom' | 'none';
  levels?: LodLevelConfig[];
}

/** Default auto-LOD levels per the spec */
const AUTO_LOD_LEVELS: LodLevelConfig[] = [
  { distance: 0, detail: 1.0 },
  { distance: 30, detail: 0.5 },
  { distance: 80, detail: 0.2 },
];

/**
 * Parse a scene-spec LOD value into a normalized LodConfig.
 */
export function parseLodConfig(
  lod: 'auto' | 'none' | { levels: { distance: number; detail: number }[] },
): LodConfig {
  if (lod === 'none') return { mode: 'none' };
  if (lod === 'auto') return { mode: 'auto', levels: AUTO_LOD_LEVELS };
  return { mode: 'custom', levels: lod.levels };
}

/**
 * Generate a Three.js LOD object from a source geometry and config.
 *
 * @param geometry  The full-detail source geometry
 * @param material  The material to apply to all LOD levels
 * @param config    LOD configuration (auto or custom levels)
 * @returns         A THREE.LOD object with child meshes at each distance level,
 *                  or null if config.mode is 'none'
 */
export function generateLOD(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  config: LodConfig,
): THREE.LOD | null {
  if (config.mode === 'none') return null;

  const levels = config.levels ?? AUTO_LOD_LEVELS;

  // Sort levels by distance ascending
  const sorted = [...levels].sort((a, b) => a.distance - b.distance);

  const lod = new THREE.LOD();

  for (const level of sorted) {
    let geom: THREE.BufferGeometry;
    if (level.detail >= 1.0) {
      // Full detail — use original geometry
      geom = geometry;
    } else {
      geom = simplifyGeometry(geometry, level.detail);
    }

    const mesh = new THREE.Mesh(geom, material);
    lod.addLevel(mesh, level.distance);
  }

  return lod;
}
