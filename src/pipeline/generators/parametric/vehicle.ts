import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';
import { seededRandom, normalizeForMerge } from './helpers.ts';

interface VehiclePreset {
  bodyLength: number;
  bodyWidth: number;
  bodyHeight: number;
  cabinHeight: number;
  cabinSetback: number;
  wheelRadius: number;
  wheelWidth: number;
  wheelCount: number;
  wheelbase: number;
  groundClearance: number;
}

const VEHICLE_PRESETS: Record<string, VehiclePreset> = {
  sedan: {
    bodyLength: 3.5, bodyWidth: 1.6, bodyHeight: 0.8,
    cabinHeight: 0.6, cabinSetback: 0.2,
    wheelRadius: 0.3, wheelWidth: 0.2, wheelCount: 4,
    wheelbase: 2.2, groundClearance: 0.15,
  },
  truck: {
    bodyLength: 5.0, bodyWidth: 2.0, bodyHeight: 1.2,
    cabinHeight: 0.8, cabinSetback: 0.0,
    wheelRadius: 0.4, wheelWidth: 0.25, wheelCount: 6,
    wheelbase: 3.2, groundClearance: 0.3,
  },
  motorcycle: {
    bodyLength: 2.0, bodyWidth: 0.5, bodyHeight: 0.6,
    cabinHeight: 0.0, cabinSetback: 0.0,
    wheelRadius: 0.35, wheelWidth: 0.1, wheelCount: 2,
    wheelbase: 1.4, groundClearance: 0.15,
  },
  van: {
    bodyLength: 4.0, bodyWidth: 1.8, bodyHeight: 1.8,
    cabinHeight: 0.3, cabinSetback: 0.0,
    wheelRadius: 0.3, wheelWidth: 0.2, wheelCount: 4,
    wheelbase: 2.6, groundClearance: 0.2,
  },
};

const VEHICLE_KEYWORDS = [
  'car', 'sedan', 'vehicle', 'automobile', 'truck', 'pickup', 'lorry',
  'van', 'motorcycle', 'motorbike', 'bike', 'suv', 'jeep', 'bus', 'taxi', 'cab',
];

function makeWheel(radius: number, width: number): THREE.BufferGeometry {
  const geom = new THREE.CylinderGeometry(radius, radius, width, 12);
  // Rotate so wheel axis is along X (Z axis rotation = 90 degrees)
  geom.rotateZ(Math.PI / 2);
  return geom;
}

function generateSedan(preset: VehiclePreset, _rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const baseY = preset.groundClearance + preset.wheelRadius;

  // Main body
  const body = new THREE.BoxGeometry(preset.bodyLength, preset.bodyHeight, preset.bodyWidth);
  body.translate(0, baseY + preset.bodyHeight / 2, 0);
  parts.push(normalizeForMerge(body));

  // Cabin
  const cabinLength = preset.bodyLength * 0.5;
  const cabinWidth = preset.bodyWidth * 0.85;
  const cabin = new THREE.BoxGeometry(cabinLength, preset.cabinHeight, cabinWidth);
  const cabinX = -preset.bodyLength * preset.cabinSetback * 0.5;
  cabin.translate(cabinX, baseY + preset.bodyHeight + preset.cabinHeight / 2, 0);
  parts.push(normalizeForMerge(cabin));

  // 4 wheels
  const frontX = preset.wheelbase / 2;
  const rearX = -preset.wheelbase / 2;
  const sideZ = preset.bodyWidth / 2 + preset.wheelWidth / 2;
  const wheelY = preset.wheelRadius + preset.groundClearance;
  const wheelPositions = [
    [frontX, wheelY, sideZ],
    [frontX, wheelY, -sideZ],
    [rearX, wheelY, sideZ],
    [rearX, wheelY, -sideZ],
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = makeWheel(preset.wheelRadius, preset.wheelWidth);
    wheel.translate(wx, wy, wz);
    parts.push(normalizeForMerge(wheel));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge sedan geometries');
  return merged;
}

function generateTruck(preset: VehiclePreset, _rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const baseY = preset.groundClearance + preset.wheelRadius;

  // Cargo bed (rear 60%)
  const cargoLength = preset.bodyLength * 0.6;
  const cargo = new THREE.BoxGeometry(cargoLength, preset.bodyHeight, preset.bodyWidth);
  cargo.translate(-preset.bodyLength * 0.1, baseY + preset.bodyHeight / 2, 0);
  parts.push(normalizeForMerge(cargo));

  // Cabin (front 40%, taller)
  const cabinLength = preset.bodyLength * 0.35;
  const cabinHeight = preset.bodyHeight + preset.cabinHeight;
  const cabin = new THREE.BoxGeometry(cabinLength, cabinHeight, preset.bodyWidth);
  cabin.translate(preset.bodyLength * 0.3, baseY + cabinHeight / 2, 0);
  parts.push(normalizeForMerge(cabin));

  // 6 wheels (dual rear)
  const frontX = preset.wheelbase / 2;
  const rearX = -preset.wheelbase / 2;
  const rearX2 = rearX - preset.wheelRadius * 2.2;
  const sideZ = preset.bodyWidth / 2 + preset.wheelWidth / 2;
  const wheelY = preset.wheelRadius + preset.groundClearance;
  const wheelPositions = [
    [frontX, wheelY, sideZ],
    [frontX, wheelY, -sideZ],
    [rearX, wheelY, sideZ],
    [rearX, wheelY, -sideZ],
    [rearX2, wheelY, sideZ],
    [rearX2, wheelY, -sideZ],
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = makeWheel(preset.wheelRadius, preset.wheelWidth);
    wheel.translate(wx, wy, wz);
    parts.push(normalizeForMerge(wheel));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge truck geometries');
  return merged;
}

function generateMotorcycle(preset: VehiclePreset, _rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const baseY = preset.groundClearance + preset.wheelRadius;

  // Frame (narrow body)
  const frame = new THREE.BoxGeometry(preset.bodyLength * 0.7, preset.bodyHeight * 0.5, preset.bodyWidth);
  frame.translate(0, baseY + preset.bodyHeight * 0.4, 0);
  parts.push(normalizeForMerge(frame));

  // Engine block
  const engine = new THREE.CylinderGeometry(preset.bodyHeight * 0.3, preset.bodyHeight * 0.3, preset.bodyWidth * 0.8, 8);
  engine.rotateZ(Math.PI / 2);
  engine.translate(0, baseY + preset.bodyHeight * 0.1, 0);
  parts.push(normalizeForMerge(engine));

  // Handlebars
  const handlebar = new THREE.BoxGeometry(0.1, 0.3, preset.bodyWidth * 2);
  handlebar.translate(preset.bodyLength * 0.3, baseY + preset.bodyHeight * 0.8, 0);
  parts.push(normalizeForMerge(handlebar));

  // 2 wheels (inline)
  const frontX = preset.wheelbase / 2;
  const rearX = -preset.wheelbase / 2;
  const wheelY = preset.wheelRadius + preset.groundClearance;
  const frontWheel = makeWheel(preset.wheelRadius, preset.wheelWidth);
  frontWheel.translate(frontX, wheelY, 0);
  parts.push(normalizeForMerge(frontWheel));

  const rearWheel = makeWheel(preset.wheelRadius, preset.wheelWidth);
  rearWheel.translate(rearX, wheelY, 0);
  parts.push(normalizeForMerge(rearWheel));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge motorcycle geometries');
  return merged;
}

function generateVan(preset: VehiclePreset, _rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const baseY = preset.groundClearance + preset.wheelRadius;

  // Main tall body
  const body = new THREE.BoxGeometry(preset.bodyLength, preset.bodyHeight, preset.bodyWidth);
  body.translate(0, baseY + preset.bodyHeight / 2, 0);
  parts.push(normalizeForMerge(body));

  // Cabin section (front portion, windshield area)
  const cabinLength = preset.bodyLength * 0.25;
  const cabin = new THREE.BoxGeometry(cabinLength, preset.cabinHeight, preset.bodyWidth * 0.95);
  cabin.translate(
    preset.bodyLength / 2 - cabinLength / 2,
    baseY + preset.bodyHeight + preset.cabinHeight / 2,
    0,
  );
  parts.push(normalizeForMerge(cabin));

  // 4 wheels
  const frontX = preset.wheelbase / 2;
  const rearX = -preset.wheelbase / 2;
  const sideZ = preset.bodyWidth / 2 + preset.wheelWidth / 2;
  const wheelY = preset.wheelRadius + preset.groundClearance;
  const wheelPositions = [
    [frontX, wheelY, sideZ],
    [frontX, wheelY, -sideZ],
    [rearX, wheelY, sideZ],
    [rearX, wheelY, -sideZ],
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = makeWheel(preset.wheelRadius, preset.wheelWidth);
    wheel.translate(wx, wy, wz);
    parts.push(normalizeForMerge(wheel));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge van geometries');
  return merged;
}

export const vehicleGenerator: Generator = {
  name: 'parametric/vehicle',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/vehicle') return 0.95;
    const prompt = object.prompt.toLowerCase();
    const matchCount = VEHICLE_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.5;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    const typeName = (params.type as string) ?? 'sedan';
    const seed = (params.seed as number) ?? 0;
    const rng = seededRandom(seed);

    const basePreset = VEHICLE_PRESETS[typeName] ?? VEHICLE_PRESETS.sedan;
    const preset: VehiclePreset = {
      bodyLength: (params.bodyLength as number) ?? basePreset.bodyLength,
      bodyWidth: (params.bodyWidth as number) ?? basePreset.bodyWidth,
      bodyHeight: (params.bodyHeight as number) ?? basePreset.bodyHeight,
      cabinHeight: (params.cabinHeight as number) ?? basePreset.cabinHeight,
      cabinSetback: (params.cabinSetback as number) ?? basePreset.cabinSetback,
      wheelRadius: (params.wheelRadius as number) ?? basePreset.wheelRadius,
      wheelWidth: (params.wheelWidth as number) ?? basePreset.wheelWidth,
      wheelCount: (params.wheelCount as number) ?? basePreset.wheelCount,
      wheelbase: (params.wheelbase as number) ?? basePreset.wheelbase,
      groundClearance: (params.groundClearance as number) ?? basePreset.groundClearance,
    };

    let geometry: THREE.BufferGeometry;
    switch (typeName) {
      case 'truck':
        geometry = generateTruck(preset, rng);
        break;
      case 'motorcycle':
        geometry = generateMotorcycle(preset, rng);
        break;
      case 'van':
        geometry = generateVan(preset, rng);
        break;
      case 'sedan':
      default:
        geometry = generateSedan(preset, rng);
        break;
    }

    geometry.computeVertexNormals();
    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/vehicle',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
