import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';
import { seededRandom, normalizeForMerge } from './helpers.ts';

interface DebrisPreset {
  width: number;
  height: number;
  depth: number;
  segments: number;
}

const DEBRIS_PRESETS: Record<string, DebrisPreset> = {
  tire: {
    width: 0.7, height: 0.24, depth: 0.7, segments: 16,
  },
  barrel: {
    width: 0.8, height: 0.9, depth: 0.8, segments: 12,
  },
  crate: {
    width: 0.8, height: 0.8, depth: 0.8, segments: 1,
  },
  pipe: {
    width: 0.3, height: 2.0, depth: 0.3, segments: 8,
  },
};

const DEBRIS_KEYWORDS = [
  'tire', 'tyre', 'barrel', 'drum', 'crate', 'container', 'pipe',
  'tube', 'debris', 'junk', 'trash', 'scrap', 'wreckage', 'rubble pile', 'dumpster',
];

function generateTire(preset: DebrisPreset, _rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const majorRadius = preset.width / 2;
  const tubeRadius = preset.height / 2;

  // Main tire
  const tire = new THREE.TorusGeometry(majorRadius, tubeRadius, 8, preset.segments);
  // Lay flat
  tire.rotateX(Math.PI / 2);
  parts.push(normalizeForMerge(tire));

  // Hub disc inside
  const hub = new THREE.CylinderGeometry(majorRadius * 0.5, majorRadius * 0.5, tubeRadius * 0.5, 8);
  hub.translate(0, 0, 0);
  parts.push(normalizeForMerge(hub));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge tire geometries');
  return merged;
}

function generateBarrel(preset: DebrisPreset, _rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const radius = preset.width / 2;
  const topRadius = radius * 0.9;

  // Main body (slight taper)
  const body = new THREE.CylinderGeometry(topRadius, radius, preset.height, preset.segments);
  body.translate(0, preset.height / 2, 0);
  parts.push(normalizeForMerge(body));

  // Metal bands
  const bandRadius = radius * 0.95;
  const bandTube = 0.02;
  const band1 = new THREE.TorusGeometry(bandRadius, bandTube, 6, preset.segments);
  band1.rotateX(Math.PI / 2);
  band1.translate(0, preset.height * 0.25, 0);
  parts.push(normalizeForMerge(band1));

  const band2 = new THREE.TorusGeometry(bandRadius, bandTube, 6, preset.segments);
  band2.rotateX(Math.PI / 2);
  band2.translate(0, preset.height * 0.75, 0);
  parts.push(normalizeForMerge(band2));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge barrel geometries');
  return merged;
}

function generateCrate(preset: DebrisPreset, _rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const size = preset.width;

  // Main body
  const body = new THREE.BoxGeometry(size, size, size);
  body.translate(0, size / 2, 0);
  parts.push(normalizeForMerge(body));

  // Planks on front face (cross pattern)
  const plankThickness = size * 0.08;

  // Horizontal plank
  const hPlank = new THREE.BoxGeometry(size * 1.01, plankThickness, plankThickness);
  hPlank.translate(0, size / 2, size / 2 + plankThickness / 2);
  parts.push(normalizeForMerge(hPlank));

  // Vertical plank
  const vPlank = new THREE.BoxGeometry(plankThickness, size * 1.01, plankThickness);
  vPlank.translate(0, size / 2, size / 2 + plankThickness / 2);
  parts.push(normalizeForMerge(vPlank));

  // Horizontal plank on back face
  const hPlankBack = new THREE.BoxGeometry(size * 1.01, plankThickness, plankThickness);
  hPlankBack.translate(0, size / 2, -(size / 2 + plankThickness / 2));
  parts.push(normalizeForMerge(hPlankBack));

  // Vertical plank on back face
  const vPlankBack = new THREE.BoxGeometry(plankThickness, size * 1.01, plankThickness);
  vPlankBack.translate(0, size / 2, -(size / 2 + plankThickness / 2));
  parts.push(normalizeForMerge(vPlankBack));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge crate geometries');
  return merged;
}

function generatePipe(preset: DebrisPreset, rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const radius = preset.width / 2;
  const length = preset.height;

  // Main pipe (open-ended)
  const pipe = new THREE.CylinderGeometry(radius, radius, length, preset.segments, 1, true);
  pipe.translate(0, length / 2, 0);
  parts.push(normalizeForMerge(pipe));

  // Inner wall for thickness appearance
  const innerRadius = radius * 0.8;
  const innerPipe = new THREE.CylinderGeometry(innerRadius, innerRadius, length, preset.segments, 1, true);
  innerPipe.translate(0, length / 2, 0);
  parts.push(normalizeForMerge(innerPipe));

  // Optional elbow joint (always add for visual interest)
  const elbowRadius = radius * 1.5;
  const elbow = new THREE.TorusGeometry(elbowRadius, radius, 6, preset.segments, Math.PI / 2);
  elbow.rotateY(Math.PI / 2);
  elbow.translate(0, length + elbowRadius, 0);
  parts.push(normalizeForMerge(elbow));

  // Use rng to prevent unused parameter warning
  void rng;

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge pipe geometries');
  return merged;
}

export const debrisGenerator: Generator = {
  name: 'parametric/debris',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/debris') return 0.95;
    const prompt = object.prompt.toLowerCase();
    const matchCount = DEBRIS_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.5;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    const typeName = (params.type as string) ?? 'crate';
    const seed = (params.seed as number) ?? 0;
    const rng = seededRandom(seed);

    const basePreset = DEBRIS_PRESETS[typeName] ?? DEBRIS_PRESETS.crate;
    const preset: DebrisPreset = {
      width: (params.width as number) ?? basePreset.width,
      height: (params.height as number) ?? basePreset.height,
      depth: (params.depth as number) ?? basePreset.depth,
      segments: (params.segments as number) ?? basePreset.segments,
    };

    let geometry: THREE.BufferGeometry;
    switch (typeName) {
      case 'tire':
        geometry = generateTire(preset, rng);
        break;
      case 'barrel':
        geometry = generateBarrel(preset, rng);
        break;
      case 'pipe':
        geometry = generatePipe(preset, rng);
        break;
      case 'crate':
      default:
        geometry = generateCrate(preset, rng);
        break;
    }

    geometry.computeVertexNormals();
    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/debris',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
