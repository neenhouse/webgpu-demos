import { registerPreset } from './registry.ts';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  hash,
  positionLocal,
  normalLocal,
  normalWorld,
  cameraPosition,
  positionWorld,
  mix,
  Fn,
} from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Fresnel helper for subsurface scattering simulation.
 */
const fresnel = Fn(() => {
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const nDotV = normalWorld.dot(viewDir).saturate();
  return float(1.0).sub(nDotV).pow(2.0);
});

/**
 * Organic (skin/flesh) preset: flesh tones with subsurface scattering hint.
 * Medium roughness, zero metalness, warm emissive on face-on surfaces.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Flesh tones with multi-octave hash noise variation
  const paleFlesh = color(0xffcba4);
  const reddishFlesh = color(0xcc7755);
  const noise1 = hash(positionLocal.mul(25));
  const noise2 = hash(positionLocal.mul(67));
  const noise3 = hash(positionLocal.mul(143));
  const blendedNoise = noise1.mul(0.5).add(noise2.mul(0.3)).add(noise3.mul(0.2));
  mat.colorNode = mix(paleFlesh, reddishFlesh, blendedNoise);

  // Medium roughness
  mat.roughnessNode = float(0.55);

  // Zero metalness (skin is dielectric)
  mat.metalnessNode = float(0.0);

  // Subtle subsurface scattering hint via emissive:
  // Warm red glow on face-on surfaces (opposite of fresnel rim),
  // simulating light passing through thin skin.
  mat.emissiveNode = color(0xff4422).mul(fresnel().oneMinus().mul(0.15));

  // Slight vertex displacement for organic surface irregularity
  mat.positionNode = positionLocal.add(
    normalLocal.mul(hash(positionLocal.mul(40)).mul(0.003))
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

registerPreset('organic', factory);
registerPreset('skin-organic', factory);
registerPreset('skin', factory);

export default factory;
