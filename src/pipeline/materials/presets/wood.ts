import { registerPreset } from './index.ts';
import * as THREE from 'three/webgpu';
import { color, float, positionLocal, mix, smoothstep } from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Wood oak preset: warm brown tones with sin-based grain banding.
 * Medium roughness (polished wood), zero metalness.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Wood grain using position-based sin at varying frequencies
  const lightOak = color(0xd4a574);
  const darkGrain = color(0x8b5e3c);

  // Sin-based grain pattern: primary direction along Y with cross-grain variation
  const grainPattern = positionLocal.x.mul(2)
    .add(positionLocal.y.mul(20))
    .add(positionLocal.z.mul(2))
    .sin()
    .mul(0.5)
    .add(0.5);

  // Sharper grain lines using smoothstep
  const sharpGrain = smoothstep(float(0.3), float(0.7), grainPattern);
  mat.colorNode = mix(darkGrain, lightOak, sharpGrain);

  // Medium roughness -- polished wood feel
  mat.roughnessNode = float(0.55);

  // Zero metalness
  mat.metalnessNode = float(0.0);

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

registerPreset('wood-oak', factory);
registerPreset('wood', factory);

export default factory;
