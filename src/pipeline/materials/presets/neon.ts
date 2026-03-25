import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  normalWorld,
  cameraPosition,
  positionWorld,
  time,
  oscSine,
  Fn,
} from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Fresnel helper for neon edge intensification.
 */
const fresnel = Fn(() => {
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const nDotV = normalWorld.dot(viewDir).saturate();
  return float(1.0).sub(nDotV).pow(2.0);
});

/**
 * Neon glow preset: emissive-driven with pulsing glow and fresnel rim.
 * Default color is cyan (#00ffcc). Low roughness and metalness.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Determine neon color: use override color or default cyan
  const neonColor = overrides?.color ? color(overrides.color) : color(0x00ffcc);

  // Base color matches the neon color
  mat.colorNode = neonColor;

  // Strong emissive glow with gentle pulsing (breathing effect)
  // Emissive sweet spot is 2-3x (per learnings)
  const pulse = oscSine(time.mul(1.5)).mul(0.3).add(0.85);
  const baseGlow = neonColor.mul(float(2.5)).mul(pulse);

  // Fresnel rim to intensify edges
  const rimGlow = neonColor.mul(fresnel().mul(1.5));

  mat.emissiveNode = baseGlow.add(rimGlow);

  // Low roughness
  mat.roughnessNode = float(0.2);

  // Low metalness
  mat.metalnessNode = float(0.1);

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

registerPreset('neon-glow', factory);
registerPreset('neon', factory);

export default factory;
