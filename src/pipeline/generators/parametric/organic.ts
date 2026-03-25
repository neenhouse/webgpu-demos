import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';
import { seededRandom, normalizeForMerge } from './helpers.ts';

interface OrganicPreset {
  height: number;
  baseRadius: number;
  topRadius: number;
  stemHeight: number;
  stemRadius: number;
  detail: number;
  noiseFrequency: number;
  noiseAmplitude: number;
  branchCount: number;
}

const ORGANIC_PRESETS: Record<string, OrganicPreset> = {
  mushroom: {
    height: 0.8, baseRadius: 0.08, topRadius: 0.35,
    stemHeight: 0.5, stemRadius: 0.06, detail: 1,
    noiseFrequency: 0, noiseAmplitude: 0, branchCount: 0,
  },
  coral: {
    height: 1.2, baseRadius: 0.15, topRadius: 0.08,
    stemHeight: 0.3, stemRadius: 0.05, detail: 1,
    noiseFrequency: 0, noiseAmplitude: 0, branchCount: 6,
  },
  alien_growth: {
    height: 0.8, baseRadius: 0.3, topRadius: 0.2,
    stemHeight: 0, stemRadius: 0, detail: 2,
    noiseFrequency: 2.5, noiseAmplitude: 0.15, branchCount: 0,
  },
  shell: {
    height: 0.6, baseRadius: 0.25, topRadius: 0.05,
    stemHeight: 0, stemRadius: 0, detail: 1,
    noiseFrequency: 1.0, noiseAmplitude: 0.03, branchCount: 0,
  },
};

const ORGANIC_KEYWORDS = [
  'mushroom', 'fungus', 'coral', 'reef', 'organic', 'growth', 'alien',
  'organism', 'shell', 'snail', 'tentacle', 'polyp', 'anemone', 'barnacle',
  'lichen', 'moss', 'spore', 'pod',
];

/** Hash-based 3D noise for organic displacement */
function hash3D(x: number, y: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 269.5 + z * 419.2 + seed * 43758.5453) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function noise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

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

function generateMushroom(preset: OrganicPreset, _rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Stem via LatheGeometry (narrow cylinder with slight widening at base)
  const stemProfile: THREE.Vector2[] = [
    new THREE.Vector2(preset.stemRadius, 0),
    new THREE.Vector2(preset.stemRadius * 0.8, preset.stemHeight * 0.5),
    new THREE.Vector2(preset.stemRadius * 0.6, preset.stemHeight),
  ];
  const stem = new THREE.LatheGeometry(stemProfile, 12);
  parts.push(normalizeForMerge(stem));

  // Cap via LatheGeometry (dome profile)
  const capProfile: THREE.Vector2[] = [
    new THREE.Vector2(preset.stemRadius * 0.3, preset.stemHeight),
    new THREE.Vector2(preset.topRadius, preset.stemHeight + preset.height * 0.1),
    new THREE.Vector2(preset.topRadius * 0.9, preset.stemHeight + preset.height * 0.25),
    new THREE.Vector2(0.001, preset.stemHeight + preset.height * 0.35),
  ];
  const cap = new THREE.LatheGeometry(capProfile, 16);
  parts.push(normalizeForMerge(cap));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge mushroom geometries');
  return merged;
}

function generateCoral(preset: OrganicPreset, rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Base
  const base = new THREE.CylinderGeometry(preset.baseRadius, preset.baseRadius * 1.2, preset.stemHeight, 8);
  base.translate(0, preset.stemHeight / 2, 0);
  parts.push(normalizeForMerge(base));

  // Branches
  const branchCount = preset.branchCount || 6;
  for (let i = 0; i < branchCount; i++) {
    const branchRadius = preset.stemRadius * (0.8 + rng() * 0.4);
    const branchHeight = preset.height * (0.5 + rng() * 0.5);

    const branch = new THREE.CylinderGeometry(
      branchRadius * 0.6, branchRadius, branchHeight, 6,
    );
    branch.translate(0, branchHeight / 2, 0);

    // Random tilt
    const tiltAngle = (5 + rng() * 20) * (Math.PI / 180);
    const tiltAxis = rng() > 0.5 ? 'x' : 'z';
    const tiltMatrix = new THREE.Matrix4();
    if (tiltAxis === 'x') {
      tiltMatrix.makeRotationX(tiltAngle * (rng() > 0.5 ? 1 : -1));
    } else {
      tiltMatrix.makeRotationZ(tiltAngle * (rng() > 0.5 ? 1 : -1));
    }
    branch.applyMatrix4(tiltMatrix);

    // Rotate around Y
    const yAngle = (i / branchCount) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const yMatrix = new THREE.Matrix4();
    yMatrix.makeRotationY(yAngle);
    branch.applyMatrix4(yMatrix);

    // Position at base top
    branch.translate(0, preset.stemHeight, 0);
    parts.push(normalizeForMerge(branch));

    // Tip sphere
    const tip = new THREE.SphereGeometry(branchRadius, 4, 4);
    // Approximate tip position
    const tipHeight = preset.stemHeight + branchHeight * Math.cos(tiltAngle);
    const tipOffset = branchHeight * Math.sin(tiltAngle);
    tip.translate(
      Math.sin(yAngle) * tipOffset,
      tipHeight,
      Math.cos(yAngle) * tipOffset,
    );
    parts.push(normalizeForMerge(tip));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge coral geometries');
  return merged;
}

function generateAlienGrowth(preset: OrganicPreset, rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const clusterCount = 3 + Math.floor(rng() * 3);
  const seed = Math.floor(rng() * 10000);

  for (let i = 0; i < clusterCount; i++) {
    const radius = preset.baseRadius * (0.5 + rng() * 0.8);
    const ico = new THREE.IcosahedronGeometry(radius, preset.detail);

    // Noise displacement
    const freq = preset.noiseFrequency * (0.8 + rng() * 0.4);
    const amp = preset.noiseAmplitude * (0.7 + rng() * 0.6);
    const positions = ico.attributes.position;

    for (let v = 0; v < positions.count; v++) {
      const x = positions.getX(v);
      const y = positions.getY(v);
      const z = positions.getZ(v);
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;
      const disp = noise3D(x * freq, y * freq, z * freq, seed + i) * amp;
      positions.setXYZ(v, x + nx * disp, y + ny * disp, z + nz * disp);
    }
    ico.computeVertexNormals();

    // Position in cluster
    ico.translate(
      (rng() - 0.5) * preset.baseRadius,
      radius + rng() * preset.height * 0.3,
      (rng() - 0.5) * preset.baseRadius,
    );
    parts.push(normalizeForMerge(ico));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge alien growth geometries');
  return merged;
}

function generateShell(preset: OrganicPreset, rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const seed = Math.floor(rng() * 10000);

  // Spiral using torus segments at increasing radius and Y
  const spiralTurns = 3;
  const segmentsPerTurn = 8;
  const totalSegments = spiralTurns * segmentsPerTurn;

  for (let i = 0; i < totalSegments; i++) {
    const t = i / totalSegments;
    const angle = t * spiralTurns * Math.PI * 2;
    const currentRadius = preset.baseRadius * (1 - t * 0.7);
    const tubeRadius = currentRadius * 0.25;

    if (tubeRadius < 0.005) continue;

    const torus = new THREE.TorusGeometry(tubeRadius * 2, tubeRadius, 4, 6, Math.PI * 0.5);

    // Position along spiral
    const spiralRadius = preset.baseRadius * (1 - t * 0.5);
    const x = Math.cos(angle) * spiralRadius;
    const z = Math.sin(angle) * spiralRadius;
    const y = t * preset.height;

    torus.rotateY(angle);
    torus.translate(x, y, z);

    // Slight noise displacement
    if (preset.noiseAmplitude > 0) {
      const positions = torus.attributes.position;
      for (let v = 0; v < positions.count; v++) {
        const px = positions.getX(v);
        const py = positions.getY(v);
        const pz = positions.getZ(v);
        const disp = noise3D(
          px * preset.noiseFrequency,
          py * preset.noiseFrequency,
          pz * preset.noiseFrequency,
          seed,
        ) * preset.noiseAmplitude;
        positions.setY(v, py + disp);
      }
    }

    parts.push(normalizeForMerge(torus));
  }

  if (parts.length === 0) {
    // Fallback: simple torus
    const fallback = new THREE.TorusGeometry(preset.baseRadius, preset.baseRadius * 0.3, 8, 16);
    parts.push(normalizeForMerge(fallback));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge shell geometries');
  return merged;
}

export const organicGenerator: Generator = {
  name: 'parametric/organic',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/organic') return 0.95;
    const prompt = object.prompt.toLowerCase();
    const matchCount = ORGANIC_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.5;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    const typeName = (params.type as string) ?? 'mushroom';
    const seed = (params.seed as number) ?? 0;
    const rng = seededRandom(seed);

    const basePreset = ORGANIC_PRESETS[typeName] ?? ORGANIC_PRESETS.mushroom;
    const preset: OrganicPreset = {
      height: (params.height as number) ?? basePreset.height,
      baseRadius: (params.baseRadius as number) ?? basePreset.baseRadius,
      topRadius: (params.topRadius as number) ?? basePreset.topRadius,
      stemHeight: (params.stemHeight as number) ?? basePreset.stemHeight,
      stemRadius: (params.stemRadius as number) ?? basePreset.stemRadius,
      detail: (params.detail as number) ?? basePreset.detail,
      noiseFrequency: (params.noiseFrequency as number) ?? basePreset.noiseFrequency,
      noiseAmplitude: (params.noiseAmplitude as number) ?? basePreset.noiseAmplitude,
      branchCount: (params.branchCount as number) ?? basePreset.branchCount,
    };

    let geometry: THREE.BufferGeometry;
    switch (typeName) {
      case 'coral':
        geometry = generateCoral(preset, rng);
        break;
      case 'alien_growth':
        geometry = generateAlienGrowth(preset, rng);
        break;
      case 'shell':
        geometry = generateShell(preset, rng);
        break;
      case 'mushroom':
      default:
        geometry = generateMushroom(preset, rng);
        break;
    }

    geometry.computeVertexNormals();
    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/organic',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
