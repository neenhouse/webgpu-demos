import type { Camera, Environment, Transform } from './types';

/**
 * Canonical default values for optional fields.
 * Zod schemas apply these during validation via .default().
 * This module exports them for reference and for consumers
 * that need default values outside of parsing (e.g., editor UI).
 */

export const DEFAULT_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
};

export const DEFAULT_CAMERA: Camera = {
  position: [0, 5, 10],
  target: [0, 0, 0],
  fov: 60,
  near: 0.1,
  far: 1000,
};

export const DEFAULT_ENVIRONMENT: Environment = {
  background: '#000000',
  ambient: { color: '#ffffff', intensity: 0.5 },
  lights: [],
};

export const DEFAULT_OBJECT_FLAGS = {
  visible: true,
  castShadow: true,
  receiveShadow: true,
  lod: 'none' as const,
  collision: 'none' as const,
};

export const DEFAULT_MATERIAL = {
  side: 'front' as const,
  blending: 'normal' as const,
};

export const DEFAULT_TEXTURE = {
  resolution: 1024,
  tiling: [1, 1] as [number, number],
  source: 'procedural' as const,
};

export const DEFAULT_ANIMATION = {
  speed: 1,
  amplitude: 1,
  delay: 0,
  loop: true,
};
