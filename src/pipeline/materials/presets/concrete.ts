import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import { color, float, hash, positionLocal, normalLocal, mix } from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Weathered concrete preset: grey base with dirt variation.
 * High roughness, near-zero metalness, subtle surface displacement.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Grey base with dirt variation using multi-octave hash noise
  const baseGrey = color(0x888888);
  const dirtBrown = color(0x554433);
  const noise1 = hash(positionLocal.mul(25));
  const noise2 = hash(positionLocal.mul(67));
  const noise3 = hash(positionLocal.mul(143));
  const blendedNoise = noise1.mul(0.5).add(noise2.mul(0.3)).add(noise3.mul(0.2));
  mat.colorNode = mix(baseGrey, dirtBrown, blendedNoise.mul(0.4));

  // High roughness 0.85-0.98
  mat.roughnessNode = float(0.85).add(hash(positionLocal.mul(30)).mul(0.13));

  // Near zero metalness
  mat.metalnessNode = float(0.02);

  // Subtle position displacement along normals for surface roughness feel
  mat.positionNode = positionLocal.add(
    normalLocal.mul(hash(positionLocal.mul(30)).mul(0.005))
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

registerPreset('concrete-weathered', factory);
registerPreset('concrete', factory);

export default factory;
