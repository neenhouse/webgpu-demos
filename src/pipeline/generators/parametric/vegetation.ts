import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';

interface VegetationPreset {
  height: number;
  trunkRadius: number;
  trunkTaper: number;
  branchCount: number;
  branchAngle: number; // degrees
  foliageRadius: number;
  foliageDensity: number;
}

const VEGETATION_PRESETS: Record<string, VegetationPreset> = {
  tree: {
    height: 4.0, trunkRadius: 0.2, trunkTaper: 0.6,
    branchCount: 5, branchAngle: 45, foliageRadius: 1.5, foliageDensity: 5,
  },
  pine: {
    height: 6.0, trunkRadius: 0.15, trunkTaper: 0.7,
    branchCount: 8, branchAngle: 70, foliageRadius: 1.0, foliageDensity: 4,
  },
  palm: {
    height: 5.0, trunkRadius: 0.12, trunkTaper: 0.3,
    branchCount: 0, branchAngle: 0, foliageRadius: 2.0, foliageDensity: 6,
  },
  bush: {
    height: 1.5, trunkRadius: 0.08, trunkTaper: 0.5,
    branchCount: 0, branchAngle: 0, foliageRadius: 1.0, foliageDensity: 7,
  },
};

const VEG_KEYWORDS = [
  'tree', 'bush', 'shrub', 'hedge', 'pine', 'palm', 'oak',
  'forest', 'vegetation', 'plant', 'foliage', 'canopy',
  'trunk', 'branch', 'leaf', 'flower', 'grass', 'fern',
  'bamboo', 'willow', 'birch', 'maple', 'redwood',
];

/** Simple seeded random number generator */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generate a trunk as a tapered cylinder.
 * Base at y=0, top at y=height.
 */
function generateTrunk(
  height: number,
  baseRadius: number,
  taper: number,
  radialSegments: number = 8,
): THREE.BufferGeometry {
  const topRadius = baseRadius * (1 - taper);
  const geom = new THREE.CylinderGeometry(topRadius, baseRadius, height, radialSegments);
  // Move so base is at y=0
  geom.translate(0, height / 2, 0);
  return geom;
}

/**
 * Generate a branch as a small cylinder positioned along the trunk.
 */
function generateBranch(
  trunkHeight: number,
  heightFraction: number,
  angleAroundTrunk: number,
  branchAngle: number, // degrees from vertical
  branchLength: number,
  branchRadius: number,
): THREE.BufferGeometry {
  const geom = new THREE.CylinderGeometry(branchRadius * 0.5, branchRadius, branchLength, 6);
  // Move branch so base is at origin
  geom.translate(0, branchLength / 2, 0);

  // Apply branch angle (tilt outward)
  const angleRad = (branchAngle * Math.PI) / 180;
  const matrix = new THREE.Matrix4();
  matrix.makeRotationZ(-angleRad);
  geom.applyMatrix4(matrix);

  // Rotate around trunk
  const rotY = new THREE.Matrix4();
  rotY.makeRotationY(angleAroundTrunk);
  geom.applyMatrix4(rotY);

  // Position at the correct height on trunk
  geom.translate(0, trunkHeight * heightFraction, 0);

  return geom;
}

/**
 * Generate a foliage cluster as a slightly displaced sphere/icosahedron.
 */
function generateFoliageCluster(
  x: number, y: number, z: number,
  radius: number,
  rng: () => number,
): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(radius * (0.7 + rng() * 0.6), 1);

  // Slight random displacement for organic look
  const positions = geom.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const px = positions.getX(i);
    const py = positions.getY(i);
    const pz = positions.getZ(i);
    const disp = (rng() - 0.5) * radius * 0.15;
    positions.setXYZ(i, px + disp, py + disp, pz + disp);
  }
  geom.computeVertexNormals();

  geom.translate(x, y, z);
  return geom;
}

/**
 * Normalize geometry for merging: convert to non-indexed and ensure UVs exist.
 * mergeGeometries requires all geometries to either be indexed or non-indexed.
 * We standardize on non-indexed to avoid compatibility issues.
 */
function normalizeForMerge(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let geom = geometry;
  if (geom.index) {
    geom = geom.toNonIndexed();
  }
  return ensureUVs(geom);
}

/**
 * Ensure a geometry has UV attributes.
 * If none exist, generate simple spherical UVs.
 */
function ensureUVs(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.attributes.uv) return geometry;

  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    uvs[i * 2] = 0.5 + Math.atan2(z / len, x / len) / (2 * Math.PI);
    uvs[i * 2 + 1] = 0.5 - Math.asin(Math.max(-1, Math.min(1, y / len))) / Math.PI;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * Generate a deciduous tree: trunk + branches + round foliage at crown.
 */
function generateTree(preset: VegetationPreset, seed: number): THREE.BufferGeometry {
  const rng = seededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];

  // Trunk
  parts.push(normalizeForMerge(generateTrunk(preset.height, preset.trunkRadius, preset.trunkTaper)));

  // Branches
  for (let i = 0; i < preset.branchCount; i++) {
    const heightFrac = 0.4 + (i / preset.branchCount) * 0.4 + (rng() - 0.5) * 0.1;
    const angle = (i / preset.branchCount) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const branchLength = preset.height * 0.25 * (0.7 + rng() * 0.6);
    const branchRadius = preset.trunkRadius * 0.3;
    parts.push(normalizeForMerge(generateBranch(
      preset.height, heightFrac, angle, preset.branchAngle,
      branchLength, branchRadius,
    )));
  }

  // Foliage clusters at crown
  const crownY = preset.height * 0.75;
  for (let i = 0; i < preset.foliageDensity; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * preset.foliageRadius * 0.5;
    const fx = Math.cos(angle) * dist;
    const fz = Math.sin(angle) * dist;
    const fy = crownY + (rng() - 0.3) * preset.foliageRadius;
    parts.push(normalizeForMerge(generateFoliageCluster(fx, fy, fz, preset.foliageRadius * 0.5, rng)));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge tree geometries');
  return merged;
}

/**
 * Generate a pine tree: tall trunk + stacked cone-shaped foliage layers.
 */
function generatePine(preset: VegetationPreset, seed: number): THREE.BufferGeometry {
  const rng = seededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];

  // Trunk
  parts.push(normalizeForMerge(generateTrunk(preset.height, preset.trunkRadius, preset.trunkTaper)));

  // Stacked cone layers for foliage
  const layers = preset.foliageDensity;
  for (let i = 0; i < layers; i++) {
    const layerFrac = (i + 1) / (layers + 1);
    const y = preset.height * (0.3 + layerFrac * 0.65);
    const layerRadius = preset.foliageRadius * (1.3 - layerFrac * 0.8);
    const coneHeight = preset.height * 0.15 * (1 + rng() * 0.2);

    const cone = new THREE.ConeGeometry(layerRadius, coneHeight, 8);
    cone.translate(0, y, 0);
    parts.push(normalizeForMerge(cone));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge pine geometries');
  return merged;
}

/**
 * Generate a palm tree: tall thin trunk with foliage at top.
 */
function generatePalm(preset: VegetationPreset, seed: number): THREE.BufferGeometry {
  const rng = seededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];

  // Trunk (slightly thinner, minimal taper)
  parts.push(normalizeForMerge(generateTrunk(preset.height, preset.trunkRadius, preset.trunkTaper)));

  // Fan of foliage at top — flattened spheres radiating outward
  const frondCount = preset.foliageDensity;
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2 + (rng() - 0.5) * 0.2;
    const dist = preset.foliageRadius * 0.6;
    const fx = Math.cos(angle) * dist;
    const fz = Math.sin(angle) * dist;
    const fy = preset.height - 0.2 + (rng() - 0.5) * 0.3;

    // Flattened sphere for palm frond
    const frond = new THREE.SphereGeometry(preset.foliageRadius * 0.4, 6, 4);
    frond.scale(1.5, 0.3, 0.8); // Flatten and elongate
    // Rotate to radiate outward
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeRotationY(angle);
    frond.applyMatrix4(rotMatrix);
    frond.translate(fx, fy, fz);
    parts.push(normalizeForMerge(frond));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge palm geometries');
  return merged;
}

/**
 * Generate a bush: dense cluster of foliage near the ground.
 */
function generateBush(preset: VegetationPreset, seed: number): THREE.BufferGeometry {
  const rng = seededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];

  // Very short trunk (nearly hidden)
  const trunkHeight = preset.height * 0.2;
  parts.push(normalizeForMerge(generateTrunk(trunkHeight, preset.trunkRadius, preset.trunkTaper)));

  // Dense cluster of foliage spheres
  for (let i = 0; i < preset.foliageDensity; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * preset.foliageRadius * 0.4;
    const fx = Math.cos(angle) * dist;
    const fz = Math.sin(angle) * dist;
    const fy = trunkHeight + (rng() - 0.2) * preset.foliageRadius * 0.6;

    parts.push(normalizeForMerge(generateFoliageCluster(
      fx, fy, fz,
      preset.foliageRadius * (0.4 + rng() * 0.3),
      rng,
    )));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge bush geometries');
  return merged;
}

export const vegetationGenerator: Generator = {
  name: 'parametric/vegetation',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/vegetation') return 0.95;
    const prompt = object.prompt.toLowerCase();
    const matchCount = VEG_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.5;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    const typeName = (params.type as string) ?? 'tree';
    const seed = (params.seed as number) ?? 0;

    // Get preset and override with explicit params
    const basePreset = VEGETATION_PRESETS[typeName] ?? VEGETATION_PRESETS.tree;
    const preset: VegetationPreset = {
      height: (params.height as number) ?? basePreset.height,
      trunkRadius: (params.trunkRadius as number) ?? basePreset.trunkRadius,
      trunkTaper: (params.trunkTaper as number) ?? basePreset.trunkTaper,
      branchCount: (params.branchCount as number) ?? basePreset.branchCount,
      branchAngle: (params.branchAngle as number) ?? basePreset.branchAngle,
      foliageRadius: (params.foliageRadius as number) ?? basePreset.foliageRadius,
      foliageDensity: (params.foliageDensity as number) ?? basePreset.foliageDensity,
    };

    let geometry: THREE.BufferGeometry;
    switch (typeName) {
      case 'pine':
        geometry = generatePine(preset, seed);
        break;
      case 'palm':
        geometry = generatePalm(preset, seed);
        break;
      case 'bush':
        geometry = generateBush(preset, seed);
        break;
      case 'tree':
      default:
        geometry = generateTree(preset, seed);
        break;
    }

    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/vegetation',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
