import * as THREE from 'three/webgpu';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';

interface BiomePreset {
  amplitude: number;
  frequency: number;
  octaves: number;
}

const BIOME_PRESETS: Record<string, BiomePreset> = {
  grassland: { amplitude: 1.5, frequency: 0.1, octaves: 4 },
  mountain: { amplitude: 5.0, frequency: 0.2, octaves: 6 },
  desert: { amplitude: 2.0, frequency: 0.05, octaves: 3 },
  canyon: { amplitude: 4.0, frequency: 0.3, octaves: 5 },
};

const TERRAIN_KEYWORDS = [
  'terrain', 'ground', 'landscape', 'hill', 'mountain', 'valley',
  'plain', 'mesa', 'canyon', 'dune', 'cliff', 'plateau',
  'floor', 'land', 'earth', 'dirt',
];

/**
 * Simple hash-based 2D value noise.
 * Returns values in [-1, 1] range.
 */
function hash2D(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 43758.5453) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * Smoothstep interpolation between grid noise values.
 */
function noise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  // Smoothstep
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  // Bilinear interpolation of hash values at grid corners
  const a = hash2D(ix, iz, seed);
  const b = hash2D(ix + 1, iz, seed);
  const c = hash2D(ix, iz + 1, seed);
  const d = hash2D(ix + 1, iz + 1, seed);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * Generate terrain height at (x, z) using octave noise.
 */
export function generateTerrainHeight(
  x: number,
  z: number,
  frequency: number,
  amplitude: number,
  octaves: number,
  seed: number,
): number {
  let height = 0;
  let freq = frequency;
  let amp = amplitude;
  for (let i = 0; i < octaves; i++) {
    height += noise2D(x * freq, z * freq, seed + i) * amp;
    freq *= 2.0;
    amp *= 0.5; // persistence
  }
  return height;
}

export const terrainGenerator: Generator = {
  name: 'parametric/terrain',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/terrain') return 0.95;
    if (object.generator?.startsWith('parametric') && object.params?.biome) return 0.8;
    const prompt = object.prompt.toLowerCase();
    const matchCount = TERRAIN_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.45;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    // Get biome preset or use defaults
    const biome = (params.biome as string) ?? 'grassland';
    const preset = BIOME_PRESETS[biome] ?? BIOME_PRESETS.grassland;

    const width = (params.width as number) ?? 20;
    const depth = (params.depth as number) ?? 20;
    const segments = (params.segments as number) ?? 128;
    const amplitude = (params.amplitude as number) ?? preset.amplitude;
    const frequency = (params.frequency as number) ?? preset.frequency;
    const octaves = (params.octaves as number) ?? preset.octaves;
    const seed = (params.seed as number) ?? 0;

    // Create plane geometry
    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    // Rotate so it lies flat on the XZ plane
    geometry.rotateX(-Math.PI / 2);

    // Displace vertices by terrain height
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const h = generateTerrainHeight(x, z, frequency, amplitude, octaves, seed);
      positions.setY(i, h);
    }

    // Recompute normals after displacement
    geometry.computeVertexNormals();

    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: positions.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/terrain',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
