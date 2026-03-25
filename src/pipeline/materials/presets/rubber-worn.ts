import { registerPreset } from './registry.ts';
import * as THREE from 'three/webgpu';
import { color, float, hash, positionLocal, normalLocal, mix } from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Worn rubber preset: dark grey-black with high roughness and subtle displacement.
 * Zero metalness, position-based noise for wear variation.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Dark grey-black with slight brownish wear patches
  const darkRubber = color(0x222222);
  const wornPatch = color(0x3a3530);
  const noise1 = hash(positionLocal.mul(20));
  const noise2 = hash(positionLocal.mul(55));
  const blendedNoise = noise1.mul(0.6).add(noise2.mul(0.4));
  mat.colorNode = mix(darkRubber, wornPatch, blendedNoise.mul(0.35));

  // High roughness 0.8-0.95 for matte rubber surface
  mat.roughnessNode = float(0.8).add(hash(positionLocal.mul(28)).mul(0.15));

  // Zero metalness
  mat.metalnessNode = float(0.0);

  // Subtle displacement for worn, uneven surface
  mat.positionNode = positionLocal.add(
    normalLocal.mul(hash(positionLocal.mul(35)).mul(0.004)),
  );

  // Apply overrides if provided
  if (overrides?.color !== undefined) mat.colorNode = color(overrides.color);
  if (overrides?.roughness !== undefined) mat.roughnessNode = float(Math.max(0, Math.min(1, overrides.roughness)));
  if (overrides?.metalness !== undefined) mat.metalnessNode = float(Math.max(0, Math.min(1, overrides.metalness)));
  if (overrides?.opacity !== undefined) {
    mat.transparent = true;
    mat.opacityNode = float(Math.max(0, Math.min(1, overrides.opacity)));
  }
  if (overrides?.emissive !== undefined) {
    const intensity = overrides.emissive_intensity ?? 1;
    mat.emissiveNode = color(overrides.emissive).mul(float(intensity));
  }

  return mat;
};

registerPreset('rubber-worn', factory);
registerPreset('rubber', factory);

export default factory;
