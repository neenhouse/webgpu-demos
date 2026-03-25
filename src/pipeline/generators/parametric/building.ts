import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';
import { seededRandom, normalizeForMerge } from './helpers.ts';

interface BuildingPreset {
  width: number;
  depth: number;
  height: number;
  floors: number;
  windowsPerFloor: number;
  windowWidth: number;
  windowHeight: number;
  hasDoor: boolean;
  hasRoof: boolean;
  roofType: 'flat' | 'gabled' | 'none';
  wallThickness: number;
  decay: number;
}

const BUILDING_PRESETS: Record<string, BuildingPreset> = {
  house: {
    width: 4, depth: 3, height: 3, floors: 1,
    windowsPerFloor: 2, windowWidth: 0.5, windowHeight: 0.6,
    hasDoor: true, hasRoof: true, roofType: 'gabled',
    wallThickness: 0.15, decay: 0,
  },
  tower: {
    width: 2, depth: 2, height: 8, floors: 3,
    windowsPerFloor: 1, windowWidth: 0.4, windowHeight: 0.5,
    hasDoor: true, hasRoof: true, roofType: 'flat',
    wallThickness: 0.2, decay: 0,
  },
  ruin: {
    width: 5, depth: 4, height: 4, floors: 1,
    windowsPerFloor: 2, windowWidth: 0.5, windowHeight: 0.6,
    hasDoor: false, hasRoof: false, roofType: 'none',
    wallThickness: 0.2, decay: 0.6,
  },
  wall: {
    width: 6, depth: 0.4, height: 3, floors: 1,
    windowsPerFloor: 0, windowWidth: 0, windowHeight: 0,
    hasDoor: false, hasRoof: false, roofType: 'none',
    wallThickness: 0.4, decay: 0,
  },
};

const BUILDING_KEYWORDS = [
  'building', 'house', 'structure', 'tower', 'ruin', 'ruins', 'wall',
  'fortress', 'castle', 'shack', 'hut', 'cabin', 'warehouse', 'barn',
  'church', 'temple', 'bunker', 'outpost',
];

function generateHouseOrTower(preset: BuildingPreset, rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const hw = preset.width / 2;
  const hd = preset.depth / 2;
  const wt = preset.wallThickness;

  // Floor
  const floor = new THREE.BoxGeometry(preset.width, wt, preset.depth);
  floor.translate(0, wt / 2, 0);
  parts.push(normalizeForMerge(floor));

  // Front wall (Z+)
  const frontWall = new THREE.BoxGeometry(preset.width, preset.height, wt);
  frontWall.translate(0, preset.height / 2, hd);
  parts.push(normalizeForMerge(frontWall));

  // Back wall (Z-)
  const backWall = new THREE.BoxGeometry(preset.width, preset.height, wt);
  backWall.translate(0, preset.height / 2, -hd);
  parts.push(normalizeForMerge(backWall));

  // Left wall (X-)
  const leftWall = new THREE.BoxGeometry(wt, preset.height, preset.depth);
  leftWall.translate(-hw, preset.height / 2, 0);
  parts.push(normalizeForMerge(leftWall));

  // Right wall (X+)
  const rightWall = new THREE.BoxGeometry(wt, preset.height, preset.depth);
  rightWall.translate(hw, preset.height / 2, 0);
  parts.push(normalizeForMerge(rightWall));

  // Windows as inset panels on front wall
  const floorHeight = preset.height / preset.floors;
  for (let f = 0; f < preset.floors; f++) {
    const windowY = (f + 0.5) * floorHeight + preset.windowHeight * 0.2;
    for (let w = 0; w < preset.windowsPerFloor; w++) {
      const windowX = ((w + 1) / (preset.windowsPerFloor + 1)) * preset.width - hw;
      const windowPanel = new THREE.BoxGeometry(
        preset.windowWidth, preset.windowHeight, wt * 0.5,
      );
      windowPanel.translate(windowX, windowY, hd + wt * 0.3);
      parts.push(normalizeForMerge(windowPanel));
    }
  }

  // Door (centered on front wall, ground level)
  if (preset.hasDoor) {
    const doorWidth = preset.width * 0.2;
    const doorHeight = floorHeight * 0.7;
    const door = new THREE.BoxGeometry(doorWidth, doorHeight, wt * 0.5);
    door.translate(0, doorHeight / 2, hd + wt * 0.3);
    parts.push(normalizeForMerge(door));
  }

  // Roof
  if (preset.hasRoof) {
    if (preset.roofType === 'gabled') {
      // A-shaped roof: two angled panels
      const roofOverhang = 0.3;
      const roofWidth = (preset.width / 2) + roofOverhang;
      const roofHeight = preset.width * 0.35;
      const roofDepthSize = preset.depth + roofOverhang * 2;
      const roofThickness = wt * 0.5;

      // Left panel
      const leftPanel = new THREE.BoxGeometry(roofWidth, roofThickness, roofDepthSize);
      const leftAngle = Math.atan2(roofHeight, preset.width / 2);
      const leftMatrix = new THREE.Matrix4();
      leftMatrix.makeRotationZ(leftAngle);
      leftPanel.applyMatrix4(leftMatrix);
      leftPanel.translate(-preset.width * 0.13, preset.height + roofHeight * 0.5, 0);
      parts.push(normalizeForMerge(leftPanel));

      // Right panel
      const rightPanel = new THREE.BoxGeometry(roofWidth, roofThickness, roofDepthSize);
      const rightMatrix = new THREE.Matrix4();
      rightMatrix.makeRotationZ(-leftAngle);
      rightPanel.applyMatrix4(rightMatrix);
      rightPanel.translate(preset.width * 0.13, preset.height + roofHeight * 0.5, 0);
      parts.push(normalizeForMerge(rightPanel));
    } else {
      // Flat roof
      const roofPlane = new THREE.BoxGeometry(preset.width + 0.2, wt, preset.depth + 0.2);
      roofPlane.translate(0, preset.height, 0);
      parts.push(normalizeForMerge(roofPlane));
    }
  }

  // Use rng to prevent unused parameter warning
  void rng;

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge building geometries');
  return merged;
}

function generateRuin(preset: BuildingPreset, rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const hw = preset.width / 2;
  const hd = preset.depth / 2;
  const wt = preset.wallThickness;

  // Floor (always present)
  const floor = new THREE.BoxGeometry(preset.width, wt, preset.depth);
  floor.translate(0, wt / 2, 0);
  parts.push(normalizeForMerge(floor));

  // Walls with random decay
  const walls = [
    { x: 0, z: hd, w: preset.width, d: wt, label: 'front' },
    { x: 0, z: -hd, w: preset.width, d: wt, label: 'back' },
    { x: -hw, z: 0, w: wt, d: preset.depth, label: 'left' },
    { x: hw, z: 0, w: wt, d: preset.depth, label: 'right' },
  ];

  for (const wall of walls) {
    if (rng() < preset.decay * 0.5) continue; // Skip some walls entirely

    const wallHeight = preset.height * (0.5 + rng() * 0.5); // Random height reduction
    const wallGeom = new THREE.BoxGeometry(wall.w, wallHeight, wall.d);
    wallGeom.translate(wall.x, wallHeight / 2, wall.z);
    parts.push(normalizeForMerge(wallGeom));
  }

  // Scattered debris blocks at base
  const debrisCount = Math.floor(3 + rng() * 4);
  for (let i = 0; i < debrisCount; i++) {
    const blockSize = 0.2 + rng() * 0.4;
    const block = new THREE.BoxGeometry(blockSize, blockSize * 0.6, blockSize);
    block.translate(
      (rng() - 0.5) * preset.width * 0.8,
      blockSize * 0.3,
      (rng() - 0.5) * preset.depth * 0.8,
    );
    parts.push(normalizeForMerge(block));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge ruin geometries');
  return merged;
}

function generateWall(preset: BuildingPreset, _rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Main wall
  const wall = new THREE.BoxGeometry(preset.width, preset.height, preset.depth);
  wall.translate(0, preset.height / 2, 0);
  parts.push(normalizeForMerge(wall));

  // Columns at each end
  const columnSize = preset.depth * 1.5;
  const columnHeight = preset.height + 0.3;

  const leftCol = new THREE.BoxGeometry(columnSize, columnHeight, columnSize);
  leftCol.translate(-preset.width / 2, columnHeight / 2, 0);
  parts.push(normalizeForMerge(leftCol));

  const rightCol = new THREE.BoxGeometry(columnSize, columnHeight, columnSize);
  rightCol.translate(preset.width / 2, columnHeight / 2, 0);
  parts.push(normalizeForMerge(rightCol));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge wall geometries');
  return merged;
}

export const buildingGenerator: Generator = {
  name: 'parametric/building',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/building') return 0.95;
    const prompt = object.prompt.toLowerCase();
    const matchCount = BUILDING_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.5;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    const typeName = (params.type as string) ?? 'house';
    const seed = (params.seed as number) ?? 0;
    const rng = seededRandom(seed);

    const basePreset = BUILDING_PRESETS[typeName] ?? BUILDING_PRESETS.house;
    const preset: BuildingPreset = {
      width: (params.width as number) ?? basePreset.width,
      depth: (params.depth as number) ?? basePreset.depth,
      height: (params.height as number) ?? basePreset.height,
      floors: (params.floors as number) ?? basePreset.floors,
      windowsPerFloor: (params.windowsPerFloor as number) ?? basePreset.windowsPerFloor,
      windowWidth: (params.windowWidth as number) ?? basePreset.windowWidth,
      windowHeight: (params.windowHeight as number) ?? basePreset.windowHeight,
      hasDoor: (params.hasDoor as boolean) ?? basePreset.hasDoor,
      hasRoof: (params.hasRoof as boolean) ?? basePreset.hasRoof,
      roofType: (params.roofType as BuildingPreset['roofType']) ?? basePreset.roofType,
      wallThickness: (params.wallThickness as number) ?? basePreset.wallThickness,
      decay: (params.decay as number) ?? basePreset.decay,
    };

    let geometry: THREE.BufferGeometry;
    switch (typeName) {
      case 'ruin':
        geometry = generateRuin(preset, rng);
        break;
      case 'wall':
        geometry = generateWall(preset, rng);
        break;
      case 'house':
      case 'tower':
      default:
        geometry = generateHouseOrTower(preset, rng);
        break;
    }

    geometry.computeVertexNormals();
    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/building',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
