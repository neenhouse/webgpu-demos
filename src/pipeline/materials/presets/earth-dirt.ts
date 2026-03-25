import { registerPreset } from './registry.ts';
import * as THREE from 'three/webgpu';
import { color, float, hash, positionLocal, normalLocal, mix } from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Earth/dirt preset: dark brown tones with position-based noise variation.
 * High roughness, zero metalness, subtle displacement for uneven ground feel.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Dark brown base with lighter patches using multi-octave hash noise
  const darkBrown = color(0x3b2315);
  const lightBrown = color(0x8b6914);
  const noise1 = hash(positionLocal.mul(12));
  const noise2 = hash(positionLocal.mul(37));
  const noise3 = hash(positionLocal.mul(89));
  const blendedNoise = noise1.mul(0.5).add(noise2.mul(0.3)).add(noise3.mul(0.2));
  mat.colorNode = mix(darkBrown, lightBrown, blendedNoise);

  // High roughness 0.85-0.98 for dry earth feel
  mat.roughnessNode = float(0.85).add(hash(positionLocal.mul(22)).mul(0.13));

  // Zero metalness
  mat.metalnessNode = float(0.0);

  // Subtle displacement along normals for uneven surface
  mat.positionNode = positionLocal.add(
    normalLocal.mul(hash(positionLocal.mul(18)).mul(0.008)),
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

registerPreset('earth-dirt', factory);
registerPreset('dirt', factory);
registerPreset('earth', factory);

export default factory;
