import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';
import { normalizeForMerge } from './helpers.ts';

interface FurniturePreset {
  width: number;
  height: number;
  depth: number;
  topThickness: number;
  legRadius: number;
  legShape: 'cylinder' | 'box';
  legCount: number;
  hasBack: boolean;
  backHeight: number;
  shelfCount: number;
}

const FURNITURE_PRESETS: Record<string, FurniturePreset> = {
  table: {
    width: 1.2, height: 0.75, depth: 0.8,
    topThickness: 0.04, legRadius: 0.03, legShape: 'cylinder',
    legCount: 4, hasBack: false, backHeight: 0, shelfCount: 0,
  },
  chair: {
    width: 0.45, height: 0.45, depth: 0.45,
    topThickness: 0.04, legRadius: 0.025, legShape: 'cylinder',
    legCount: 4, hasBack: true, backHeight: 0.4, shelfCount: 0,
  },
  shelf: {
    width: 0.8, height: 1.5, depth: 0.3,
    topThickness: 0.025, legRadius: 0.025, legShape: 'box',
    legCount: 0, hasBack: false, backHeight: 0, shelfCount: 3,
  },
  bench: {
    width: 1.5, height: 0.45, depth: 0.4,
    topThickness: 0.05, legRadius: 0.04, legShape: 'box',
    legCount: 4, hasBack: false, backHeight: 0, shelfCount: 0,
  },
};

const FURNITURE_KEYWORDS = [
  'table', 'chair', 'furniture', 'desk', 'shelf', 'shelves', 'bookshelf',
  'bench', 'stool', 'cabinet', 'dresser', 'bed', 'couch', 'sofa', 'throne', 'workbench',
];

function generateTable(preset: FurniturePreset): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Table top
  const top = new THREE.BoxGeometry(preset.width, preset.topThickness, preset.depth);
  top.translate(0, preset.height, 0);
  parts.push(normalizeForMerge(top));

  // 4 legs
  const legHeight = preset.height - preset.topThickness;
  const inset = 0.05;
  const hw = preset.width / 2 - inset;
  const hd = preset.depth / 2 - inset;

  const legPositions = [
    [-hw, 0, -hd],
    [-hw, 0, hd],
    [hw, 0, -hd],
    [hw, 0, hd],
  ];

  for (const [lx, , lz] of legPositions) {
    if (preset.legShape === 'cylinder') {
      const leg = new THREE.CylinderGeometry(preset.legRadius, preset.legRadius, legHeight, 6);
      leg.translate(lx, legHeight / 2, lz);
      parts.push(normalizeForMerge(leg));
    } else {
      const legSize = preset.legRadius * 2;
      const leg = new THREE.BoxGeometry(legSize, legHeight, legSize);
      leg.translate(lx, legHeight / 2, lz);
      parts.push(normalizeForMerge(leg));
    }
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge table geometries');
  return merged;
}

function generateChair(preset: FurniturePreset): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Seat
  const seat = new THREE.BoxGeometry(preset.width, preset.topThickness, preset.depth);
  seat.translate(0, preset.height, 0);
  parts.push(normalizeForMerge(seat));

  // 4 legs
  const legHeight = preset.height;
  const inset = 0.03;
  const hw = preset.width / 2 - inset;
  const hd = preset.depth / 2 - inset;

  const legPositions = [
    [-hw, 0, -hd],
    [-hw, 0, hd],
    [hw, 0, -hd],
    [hw, 0, hd],
  ];

  for (const [lx, , lz] of legPositions) {
    const leg = new THREE.CylinderGeometry(preset.legRadius, preset.legRadius, legHeight, 6);
    leg.translate(lx, legHeight / 2, lz);
    parts.push(normalizeForMerge(leg));
  }

  // Back panel
  if (preset.hasBack) {
    const back = new THREE.BoxGeometry(preset.width, preset.backHeight, preset.topThickness);
    back.translate(0, preset.height + preset.backHeight / 2, -preset.depth / 2);
    parts.push(normalizeForMerge(back));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge chair geometries');
  return merged;
}

function generateShelf(preset: FurniturePreset): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Two uprights (left and right)
  const uprightThickness = preset.topThickness;

  const leftUpright = new THREE.BoxGeometry(uprightThickness, preset.height, preset.depth);
  leftUpright.translate(-preset.width / 2, preset.height / 2, 0);
  parts.push(normalizeForMerge(leftUpright));

  const rightUpright = new THREE.BoxGeometry(uprightThickness, preset.height, preset.depth);
  rightUpright.translate(preset.width / 2, preset.height / 2, 0);
  parts.push(normalizeForMerge(rightUpright));

  // Shelf panels
  const shelfSpacing = preset.height / (preset.shelfCount + 1);
  for (let i = 1; i <= preset.shelfCount; i++) {
    const shelfY = i * shelfSpacing;
    const shelfPanel = new THREE.BoxGeometry(
      preset.width - uprightThickness * 2,
      preset.topThickness,
      preset.depth,
    );
    shelfPanel.translate(0, shelfY, 0);
    parts.push(normalizeForMerge(shelfPanel));
  }

  // Top shelf
  const topPanel = new THREE.BoxGeometry(preset.width, preset.topThickness, preset.depth);
  topPanel.translate(0, preset.height, 0);
  parts.push(normalizeForMerge(topPanel));

  // Bottom shelf
  const bottomPanel = new THREE.BoxGeometry(
    preset.width - uprightThickness * 2,
    preset.topThickness,
    preset.depth,
  );
  bottomPanel.translate(0, preset.topThickness / 2, 0);
  parts.push(normalizeForMerge(bottomPanel));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge shelf geometries');
  return merged;
}

function generateBench(preset: FurniturePreset): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Seat (long top)
  const top = new THREE.BoxGeometry(preset.width, preset.topThickness, preset.depth);
  top.translate(0, preset.height, 0);
  parts.push(normalizeForMerge(top));

  // 4 box legs
  const legHeight = preset.height - preset.topThickness;
  const legSize = preset.legRadius * 2;
  const inset = 0.06;
  const hw = preset.width / 2 - inset;
  const hd = preset.depth / 2 - inset;

  const legPositions = [
    [-hw, 0, -hd],
    [-hw, 0, hd],
    [hw, 0, -hd],
    [hw, 0, hd],
  ];

  for (const [lx, , lz] of legPositions) {
    const leg = new THREE.BoxGeometry(legSize, legHeight, legSize);
    leg.translate(lx, legHeight / 2, lz);
    parts.push(normalizeForMerge(leg));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge bench geometries');
  return merged;
}

export const furnitureGenerator: Generator = {
  name: 'parametric/furniture',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/furniture') return 0.95;
    const prompt = object.prompt.toLowerCase();
    const matchCount = FURNITURE_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.5;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    const typeName = (params.type as string) ?? 'table';

    const basePreset = FURNITURE_PRESETS[typeName] ?? FURNITURE_PRESETS.table;
    const preset: FurniturePreset = {
      width: (params.width as number) ?? basePreset.width,
      height: (params.height as number) ?? basePreset.height,
      depth: (params.depth as number) ?? basePreset.depth,
      topThickness: (params.topThickness as number) ?? basePreset.topThickness,
      legRadius: (params.legRadius as number) ?? basePreset.legRadius,
      legShape: (params.legShape as FurniturePreset['legShape']) ?? basePreset.legShape,
      legCount: (params.legCount as number) ?? basePreset.legCount,
      hasBack: (params.hasBack as boolean) ?? basePreset.hasBack,
      backHeight: (params.backHeight as number) ?? basePreset.backHeight,
      shelfCount: (params.shelfCount as number) ?? basePreset.shelfCount,
    };

    let geometry: THREE.BufferGeometry;
    switch (typeName) {
      case 'chair':
        geometry = generateChair(preset);
        break;
      case 'shelf':
        geometry = generateShelf(preset);
        break;
      case 'bench':
        geometry = generateBench(preset);
        break;
      case 'table':
      default:
        geometry = generateTable(preset);
        break;
    }

    geometry.computeVertexNormals();
    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/furniture',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
