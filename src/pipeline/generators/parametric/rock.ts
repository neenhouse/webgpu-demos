import * as THREE from 'three/webgpu';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';

interface RockVariant {
  detail: number;
  roughness: number;
  frequency: number;
  flatten: number;
}

const ROCK_VARIANTS: Record<string, RockVariant> = {
  boulder: { detail: 3, roughness: 0.25, frequency: 1.5, flatten: 0.0 },
  jagged: { detail: 2, roughness: 0.5, frequency: 3.0, flatten: 0.0 },
  flat: { detail: 3, roughness: 0.15, frequency: 1.0, flatten: 0.6 },
  rubble: { detail: 1, roughness: 0.4, frequency: 2.5, flatten: 0.0 },
};

const ROCK_KEYWORDS = [
  'rock', 'boulder', 'stone', 'pebble', 'rubble', 'gravel',
  'cliff face', 'crag', 'ore', 'mineral', 'crystal formation',
  'cobble', 'slab', 'outcrop',
];

/**
 * 3D value noise using hash-based pseudo-random.
 * Returns values in [-1, 1] range.
 */
function hash3D(x: number, y: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 269.5 + z * 419.2 + seed * 43758.5453) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * Smoothed 3D noise with trilinear interpolation.
 */
function noise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  // Smoothstep
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  // Trilinear interpolation
  const v000 = hash3D(ix, iy, iz, seed);
  const v100 = hash3D(ix + 1, iy, iz, seed);
  const v010 = hash3D(ix, iy + 1, iz, seed);
  const v110 = hash3D(ix + 1, iy + 1, iz, seed);
  const v001 = hash3D(ix, iy, iz + 1, seed);
  const v101 = hash3D(ix + 1, iy, iz + 1, seed);
  const v011 = hash3D(ix, iy + 1, iz + 1, seed);
  const v111 = hash3D(ix + 1, iy + 1, iz + 1, seed);

  const a = v000 + (v100 - v000) * ux;
  const b = v010 + (v110 - v010) * ux;
  const c = v001 + (v101 - v001) * ux;
  const d = v011 + (v111 - v011) * ux;

  const e = a + (b - a) * uy;
  const f = c + (d - c) * uy;

  return e + (f - e) * uz;
}

/**
 * Multi-octave 3D noise for rock surface displacement.
 */
function rockNoise(x: number, y: number, z: number, frequency: number, octaves: number, seed: number): number {
  let value = 0;
  let freq = frequency;
  let amp = 1.0;
  for (let i = 0; i < octaves; i++) {
    value += noise3D(x * freq, y * freq, z * freq, seed + i) * amp;
    freq *= 2.0;
    amp *= 0.5;
  }
  return value;
}

/**
 * Generate spherical UVs for a displaced icosahedron.
 */
function generateSphericalUVs(geometry: THREE.BufferGeometry): void {
  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // Spherical mapping
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;

    const u = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI);
    const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;

    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

export const rockGenerator: Generator = {
  name: 'parametric/rock',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/rock') return 0.95;
    const prompt = object.prompt.toLowerCase();
    const matchCount = ROCK_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.5;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    // Get variant preset or use defaults
    const variantName = (params.variant as string) ?? 'boulder';
    const variant = ROCK_VARIANTS[variantName] ?? ROCK_VARIANTS.boulder;

    const radius = (params.radius as number) ?? 1.0;
    const detail = (params.detail as number) ?? variant.detail;
    const roughness = (params.roughness as number) ?? variant.roughness;
    const frequency = (params.frequency as number) ?? variant.frequency;
    const seed = (params.seed as number) ?? 0;
    const flatten = (params.flatten as number) ?? variant.flatten;

    // Create base icosahedron
    let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);

    // Convert to non-indexed for per-face normals on jagged variant
    if (variantName === 'jagged') {
      geometry = geometry.toNonIndexed();
    }

    // Displace each vertex along its normal direction using noise
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Direction from center (original normal on icosahedron)
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;

      // Sample 3D noise at vertex position
      const displacement = rockNoise(x, y, z, frequency, 3, seed) * roughness * radius;

      // Displace along normal
      const newX = x + nx * displacement;
      let newY = y + ny * displacement;
      const newZ = z + nz * displacement;

      // Apply vertical flattening
      if (flatten > 0) {
        newY *= (1 - flatten);
      }

      positions.setXYZ(i, newX, newY, newZ);
    }

    // Recompute normals
    geometry.computeVertexNormals();

    // Generate spherical UVs
    generateSphericalUVs(geometry);

    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: positions.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/rock',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
