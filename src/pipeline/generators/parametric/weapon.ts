import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Generator, GeneratorResult, SceneObject } from '../types.ts';
import { normalizeForMerge } from './helpers.ts';

interface WeaponPreset {
  length: number;
  handleLength: number;
  handleRadius: number;
  bladeWidth: number;
  bladeThickness: number;
  guardWidth: number;
  shieldRadius: number;
  shieldCurvature: number;
}

const WEAPON_PRESETS: Record<string, WeaponPreset> = {
  sword: {
    length: 1.05, handleLength: 0.25, handleRadius: 0.02,
    bladeWidth: 0.06, bladeThickness: 0.015,
    guardWidth: 0.15, shieldRadius: 0, shieldCurvature: 0,
  },
  shield: {
    length: 0, handleLength: 0.2, handleRadius: 0.02,
    bladeWidth: 0, bladeThickness: 0,
    guardWidth: 0, shieldRadius: 0.4, shieldCurvature: 0.5,
  },
  staff: {
    length: 1.8, handleLength: 1.7, handleRadius: 0.025,
    bladeWidth: 0, bladeThickness: 0,
    guardWidth: 0, shieldRadius: 0, shieldCurvature: 0,
  },
  axe: {
    length: 0.85, handleLength: 0.6, handleRadius: 0.02,
    bladeWidth: 0.2, bladeThickness: 0.02,
    guardWidth: 0, shieldRadius: 0, shieldCurvature: 0,
  },
};

const WEAPON_KEYWORDS = [
  'sword', 'blade', 'weapon', 'shield', 'staff', 'wand', 'axe',
  'hatchet', 'mace', 'hammer', 'spear', 'lance', 'dagger', 'knife',
  'bow', 'crossbow', 'club',
];

function generateSword(preset: WeaponPreset): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Handle
  const handle = new THREE.CylinderGeometry(
    preset.handleRadius, preset.handleRadius, preset.handleLength, 8,
  );
  handle.translate(0, preset.handleLength / 2, 0);
  parts.push(normalizeForMerge(handle));

  // Pommel (sphere at bottom)
  const pommel = new THREE.SphereGeometry(preset.handleRadius * 1.5, 6, 6);
  pommel.translate(0, 0, 0);
  parts.push(normalizeForMerge(pommel));

  // Crossguard
  const guard = new THREE.BoxGeometry(
    preset.guardWidth, preset.bladeThickness * 2, preset.bladeThickness * 2,
  );
  guard.translate(0, preset.handleLength, 0);
  parts.push(normalizeForMerge(guard));

  // Blade (elongated diamond profile extruded)
  const bladeLength = preset.length - preset.handleLength;
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0);
  bladeShape.lineTo(preset.bladeWidth / 2, bladeLength * 0.1);
  bladeShape.lineTo(preset.bladeWidth / 2, bladeLength * 0.85);
  bladeShape.lineTo(0, bladeLength);
  bladeShape.lineTo(-preset.bladeWidth / 2, bladeLength * 0.85);
  bladeShape.lineTo(-preset.bladeWidth / 2, bladeLength * 0.1);
  bladeShape.lineTo(0, 0);

  const bladeGeom = new THREE.ExtrudeGeometry(bladeShape, {
    depth: preset.bladeThickness,
    bevelEnabled: false,
  });
  // Rotate to stand upright (shape is in XY plane, extrude along Z)
  // Translate so blade extends upward from crossguard
  bladeGeom.translate(-0, 0, -preset.bladeThickness / 2);
  // Rotate so Y of shape becomes Y of world (shape XY -> world XY, extrude Z stays)
  bladeGeom.translate(0, preset.handleLength, 0);
  parts.push(normalizeForMerge(bladeGeom));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge sword geometries');
  return merged;
}

function generateShield(preset: WeaponPreset): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Main shield body (spherical cap)
  const phiEnd = Math.PI * 0.3 * (1 + preset.shieldCurvature);
  const shieldBody = new THREE.SphereGeometry(
    preset.shieldRadius, 12, 8, 0, Math.PI * 2, 0, phiEnd,
  );
  // Rotate so it faces forward (Z+)
  shieldBody.rotateX(Math.PI / 2);
  parts.push(normalizeForMerge(shieldBody));

  // Boss (center front)
  const boss = new THREE.SphereGeometry(preset.shieldRadius * 0.15, 6, 6);
  boss.translate(0, 0, preset.shieldRadius * 0.1);
  parts.push(normalizeForMerge(boss));

  // Handle bar on back
  const handleBar = new THREE.BoxGeometry(
    preset.shieldRadius * 0.6, 0.02, 0.04,
  );
  handleBar.translate(0, 0, -0.03);
  parts.push(normalizeForMerge(handleBar));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge shield geometries');
  return merged;
}

function generateStaff(preset: WeaponPreset): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Shaft (slight taper)
  const shaft = new THREE.CylinderGeometry(
    preset.handleRadius, preset.handleRadius * 0.8, preset.handleLength, 6,
  );
  shaft.translate(0, preset.handleLength / 2, 0);
  parts.push(normalizeForMerge(shaft));

  // Top ornament (icosahedron)
  const ornament = new THREE.IcosahedronGeometry(preset.handleRadius * 3, 1);
  ornament.translate(0, preset.handleLength + preset.handleRadius * 3, 0);
  parts.push(normalizeForMerge(ornament));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge staff geometries');
  return merged;
}

function generateAxe(preset: WeaponPreset): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Handle
  const handle = new THREE.CylinderGeometry(
    preset.handleRadius, preset.handleRadius, preset.handleLength, 6,
  );
  handle.translate(0, preset.handleLength / 2, 0);
  parts.push(normalizeForMerge(handle));

  // Axe head (wedge shape extruded)
  const headHeight = preset.bladeWidth * 1.5;
  const headWidth = preset.bladeWidth;
  const axeShape = new THREE.Shape();
  axeShape.moveTo(0, 0);
  axeShape.lineTo(headWidth, headHeight * 0.3);
  axeShape.lineTo(headWidth * 1.1, headHeight * 0.5);
  axeShape.lineTo(headWidth, headHeight * 0.7);
  axeShape.lineTo(0, headHeight);
  axeShape.lineTo(0, 0);

  const axeHead = new THREE.ExtrudeGeometry(axeShape, {
    depth: preset.bladeThickness * 2,
    bevelEnabled: false,
  });
  // Position at top of handle, perpendicular
  axeHead.translate(-headWidth * 0.1, preset.handleLength - headHeight / 2, -preset.bladeThickness);
  parts.push(normalizeForMerge(axeHead));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Failed to merge axe geometries');
  return merged;
}

export const weaponGenerator: Generator = {
  name: 'parametric/weapon',

  canHandle(object: SceneObject): number {
    if (object.generator === 'parametric/weapon') return 0.95;
    const prompt = object.prompt.toLowerCase();
    const matchCount = WEAPON_KEYWORDS.filter(kw => prompt.includes(kw)).length;
    if (matchCount >= 2) return 0.7;
    if (matchCount === 1) return 0.5;
    return 0;
  },

  generate(object: SceneObject): GeneratorResult {
    const start = performance.now();
    const params = object.params ?? {};

    const typeName = (params.type as string) ?? 'sword';

    const basePreset = WEAPON_PRESETS[typeName] ?? WEAPON_PRESETS.sword;
    const preset: WeaponPreset = {
      length: (params.length as number) ?? basePreset.length,
      handleLength: (params.handleLength as number) ?? basePreset.handleLength,
      handleRadius: (params.handleRadius as number) ?? basePreset.handleRadius,
      bladeWidth: (params.bladeWidth as number) ?? basePreset.bladeWidth,
      bladeThickness: (params.bladeThickness as number) ?? basePreset.bladeThickness,
      guardWidth: (params.guardWidth as number) ?? basePreset.guardWidth,
      shieldRadius: (params.shieldRadius as number) ?? basePreset.shieldRadius,
      shieldCurvature: (params.shieldCurvature as number) ?? basePreset.shieldCurvature,
    };

    let geometry: THREE.BufferGeometry;
    switch (typeName) {
      case 'shield':
        geometry = generateShield(preset);
        break;
      case 'staff':
        geometry = generateStaff(preset);
        break;
      case 'axe':
        geometry = generateAxe(preset);
        break;
      case 'sword':
      default:
        geometry = generateSword(preset);
        break;
    }

    geometry.computeVertexNormals();
    const elapsed = performance.now() - start;

    return {
      geometry,
      metadata: {
        vertexCount: geometry.attributes.position.count,
        faceCount: geometry.index ? geometry.index.count / 3 : 0,
        generator: 'parametric/weapon',
        prompt: object.prompt,
        generationTime: elapsed,
      },
    };
  },
};
