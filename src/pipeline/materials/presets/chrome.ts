import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  normalWorld,
  cameraPosition,
  positionWorld,
  Fn,
} from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Fresnel helper using proven Fn() pattern from codebase.
 * Computes 1 - dot(normal, viewDir)^power for rim detection.
 */
const fresnel = Fn(() => {
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const nDotV = normalWorld.dot(viewDir).saturate();
  return float(1.0).sub(nDotV).pow(2.0);
});

/**
 * Chrome/mirror preset: near-white base, very low roughness, full metalness.
 * Fresnel-based emissive for environment reflection simulation.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Near-white base for maximum reflectivity
  mat.colorNode = color(0xf0f0f0);

  // Very low roughness for mirror-like reflection
  mat.roughnessNode = float(0.05);

  // Full metalness
  mat.metalnessNode = float(1.0);

  // Subtle blue-white rim glow simulating sky reflection
  mat.emissiveNode = color(0xaaccff).mul(fresnel()).mul(0.5);

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

registerPreset('chrome', factory);
registerPreset('mirror', factory);

export default factory;
