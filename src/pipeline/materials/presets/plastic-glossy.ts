import { registerPreset } from './registry.ts';
import * as THREE from 'three/webgpu';
import { color, float } from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Plastic glossy preset: smooth, shiny plastic surface.
 * Low roughness, zero metalness, configurable color (default red).
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Default color: bright red (configurable via overrides)
  mat.colorNode = overrides?.color ? color(overrides.color) : color(0xdd3333);

  // Low roughness for glossy finish
  mat.roughnessNode = float(0.15);

  // Zero metalness (dielectric plastic)
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

registerPreset('plastic-glossy', factory);
registerPreset('plastic', factory);

export default factory;
