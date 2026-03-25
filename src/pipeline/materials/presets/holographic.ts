import { registerPreset } from './registry.ts';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  normalWorld,
  cameraPosition,
  positionWorld,
  mix,
  Fn,
} from 'three/tsl';
import type { PresetFactory } from '../types.ts';

/**
 * Fresnel helper for view-angle detection.
 */
const fresnel = Fn(() => {
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const nDotV = normalWorld.dot(viewDir).saturate();
  return float(1.0).sub(nDotV).pow(2.0);
});

/**
 * Holographic preset: iridescent view-angle color shift via fresnel.
 * Mixes three colors (cyan, magenta, gold) based on fresnel factor
 * to create a rainbow-like iridescence effect.
 * Low roughness, medium metalness for reflective look.
 */
const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();

  // Three iridescent colors blended by fresnel angle
  const colorCyan = color(0x00ffcc);
  const colorMagenta = color(0xff00cc);
  const colorGold = color(0xffcc00);

  // Fresnel-driven iridescence: blend through 3 colors based on view angle
  const f = fresnel();
  // Low fresnel (face-on) = cyan, mid = magenta, high (rim) = gold
  const midBlend = mix(colorCyan, colorMagenta, f.mul(2.0).saturate());
  const fullBlend = mix(midBlend, colorGold, f.sub(0.5).mul(2.0).saturate());
  mat.colorNode = fullBlend;

  // Low roughness for shiny surface
  mat.roughnessNode = float(0.2);

  // Medium metalness for reflective sheen
  mat.metalnessNode = float(0.5);

  // Subtle emissive glow from the iridescent colors
  mat.emissiveNode = fullBlend.mul(0.3);

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

registerPreset('holographic', factory);
registerPreset('iridescent', factory);

export default factory;
