import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import { color, float, normalWorld, vec3, mix, smoothstep } from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Cel-shaded/toon preset: flat shading with quantized lighting bands.
 * High roughness to minimize specular, zero metalness.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.flatShading = true;

  // Base and shadow colors
  const baseColor = overrides?.color ? color(overrides.color) : color(0xeeeeee);
  const shadowColor = color(0x444444);

  // Quantized lighting simulation using normal dot product with light direction
  const lightDir = vec3(0.5, 1.0, 0.3).normalize();
  const lightFactor = normalWorld.dot(lightDir).max(0.0);

  // 3-band toon shading using smoothstep for discrete lighting bands
  const band = smoothstep(float(0.0), float(0.05), lightFactor).mul(0.33)
    .add(smoothstep(float(0.3), float(0.35), lightFactor).mul(0.33))
    .add(smoothstep(float(0.6), float(0.65), lightFactor).mul(0.34));

  // Apply banding to color
  mat.colorNode = mix(shadowColor, baseColor, band);

  // High roughness to minimize specular reflections
  mat.roughnessNode = float(0.9);

  // Zero metalness (cel shading relies on diffuse only)
  mat.metalnessNode = float(0.0);

  // Apply overrides (except color which was handled above for banding)
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

registerPreset('cel-shaded', factory);
registerPreset('toon', factory);

export default factory;
