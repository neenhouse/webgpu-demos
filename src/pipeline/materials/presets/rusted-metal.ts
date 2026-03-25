import { registerPreset } from './registry.ts';
import * as THREE from 'three/webgpu';
import { color, float, hash, positionLocal, mix } from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Rusted metal preset: orange-brown base with hash noise variation.
 * High roughness, medium metalness, no emissive.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Blend between rust orange and dark brown using hash noise
  const rustOrange = color(0xcc6633);
  const darkBrown = color(0x3d1c02);
  const noiseFactor = hash(positionLocal.mul(15));
  mat.colorNode = mix(rustOrange, darkBrown, noiseFactor);

  // High roughness varying 0.7-0.95 via hash noise at different frequency
  mat.roughnessNode = float(0.7).add(hash(positionLocal.mul(25)).mul(0.25));

  // Medium metalness varying 0.3-0.6 via hash noise at another frequency
  mat.metalnessNode = float(0.3).add(hash(positionLocal.mul(18)).mul(0.3));

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

registerPreset('rusted-metal', factory);
registerPreset('rust', factory);

export default factory;
