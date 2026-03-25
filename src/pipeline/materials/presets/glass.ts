import { registerPreset } from './registry.ts';
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
 * Fresnel helper for glass rim opacity.
 */
const fresnel = Fn(() => {
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const nDotV = normalWorld.dot(viewDir).saturate();
  return float(1.0).sub(nDotV).pow(2.0);
});

/**
 * Glass clear preset: transparent with fresnel-driven opacity.
 * Very low roughness, low metalness, DoubleSide rendering.
 */
const glassClearFactory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;

  // Very light blue tint
  mat.colorNode = color(0xe8f4f8);

  // Very low roughness for glass-like reflections
  mat.roughnessNode = float(0.05);

  // Low metalness
  mat.metalnessNode = float(0.1);

  // Fresnel-driven opacity: edges more visible than face-on surfaces
  mat.opacityNode = float(0.1).add(fresnel().mul(0.6));

  // Apply overrides if provided
  if (overrides?.color !== undefined) mat.colorNode = color(overrides.color);
  if (overrides?.roughness !== undefined) mat.roughnessNode = float(Math.max(0, Math.min(1, overrides.roughness)));
  if (overrides?.metalness !== undefined) mat.metalnessNode = float(Math.max(0, Math.min(1, overrides.metalness)));
  if (overrides?.opacity !== undefined) {
    mat.opacityNode = float(Math.max(0, Math.min(1, overrides.opacity)));
  }
  if (overrides?.emissive !== undefined) {
    const intensity = overrides.emissive_intensity ?? 1;
    mat.emissiveNode = color(overrides.emissive).mul(float(intensity));
  }

  return mat;
};

/**
 * Glass frosted preset: higher roughness and opacity than clear glass.
 */
const glassFrostedFactory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;

  // Light blue tint
  mat.colorNode = color(0xe8f4f8);

  // Higher roughness for frosted look
  mat.roughnessNode = float(0.45);

  // Low metalness
  mat.metalnessNode = float(0.1);

  // Higher base opacity than clear glass
  mat.opacityNode = float(0.3).add(fresnel().mul(0.4));

  // Apply overrides if provided
  if (overrides?.color !== undefined) mat.colorNode = color(overrides.color);
  if (overrides?.roughness !== undefined) mat.roughnessNode = float(Math.max(0, Math.min(1, overrides.roughness)));
  if (overrides?.metalness !== undefined) mat.metalnessNode = float(Math.max(0, Math.min(1, overrides.metalness)));
  if (overrides?.opacity !== undefined) {
    mat.opacityNode = float(Math.max(0, Math.min(1, overrides.opacity)));
  }
  if (overrides?.emissive !== undefined) {
    const intensity = overrides.emissive_intensity ?? 1;
    mat.emissiveNode = color(overrides.emissive).mul(float(intensity));
  }

  return mat;
};

registerPreset('glass-clear', glassClearFactory);
registerPreset('glass', glassClearFactory);
registerPreset('glass-frosted', glassFrostedFactory);

export default glassClearFactory;
