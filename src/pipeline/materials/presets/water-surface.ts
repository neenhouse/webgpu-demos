import { registerPreset } from './registry.ts';
import * as THREE from 'three/webgpu';
import { color, float, positionLocal, time, mix } from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Water surface preset: transparent blue with animated ripple pattern.
 * Low roughness, slight metalness for reflective look, DoubleSide rendering.
 * Animated normal perturbation via time-driven sin waves to simulate ripples.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.DoubleSide;

  // Transparent blue base
  const shallowBlue = color(0x3399cc);
  const deepBlue = color(0x1a5276);

  // Animated ripple factor: overlapping sin waves at different frequencies
  const ripple1 = positionLocal.x.mul(3).add(time.mul(1.2)).sin();
  const ripple2 = positionLocal.z.mul(4).add(time.mul(0.8)).sin();
  const rippleFactor = ripple1.add(ripple2).mul(0.25).add(0.5);

  mat.colorNode = mix(deepBlue, shallowBlue, rippleFactor);

  // Low roughness for reflective water
  mat.roughnessNode = float(0.15);

  // Slight metalness for reflective sheen
  mat.metalnessNode = float(0.2);

  // Semi-transparent
  mat.opacityNode = float(0.65);

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

registerPreset('water-surface', factory);
registerPreset('water', factory);

export default factory;
