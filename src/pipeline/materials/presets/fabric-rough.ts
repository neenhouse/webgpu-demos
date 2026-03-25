import { registerPreset } from './registry.ts';
import * as THREE from 'three/webgpu';
import { color, float, hash, positionLocal, mix } from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Rough fabric preset: high roughness, zero metalness, configurable color.
 * Subtle hash-based noise texture to simulate woven fiber variation.
 * Default color is a muted canvas/linen tone.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Configurable base color with subtle noise variation for woven texture feel
  const baseColor = overrides?.color ? color(overrides.color) : color(0xa09070);
  const darkerFiber = baseColor.mul(0.75);

  // Fine-grain noise to simulate individual fiber variation
  const fineNoise = hash(positionLocal.mul(80));
  const coarseNoise = hash(positionLocal.mul(15));
  const weaveNoise = fineNoise.mul(0.7).add(coarseNoise.mul(0.3));

  mat.colorNode = mix(darkerFiber, baseColor, weaveNoise);

  // High roughness for matte fabric
  mat.roughnessNode = float(0.88);

  // Zero metalness
  mat.metalnessNode = float(0.0);

  // Apply overrides (except color which was handled above)
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

registerPreset('fabric-rough', factory);
registerPreset('fabric', factory);

export default factory;
