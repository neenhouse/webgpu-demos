import type * as THREE from 'three/webgpu';

/**
 * Defines a material for a scene object.
 * Resolution order: inherit -> preset -> pbr -> prompt -> shader -> overrides
 */
export interface MaterialDef {
  /** Natural language description for AI-driven material generation */
  prompt?: string;
  /** Named preset to use as base (e.g., 'chrome', 'rusted-metal') */
  preset?: string;
  /** Structured PBR property overrides */
  pbr?: PbrValues;
  /** Inline TSL shader code block (replaces node assignments atomically) */
  shader?: string;
  /** Inherit from parent or named object's material */
  inherit?: 'parent' | string;
  /** Final overrides applied after all other resolution steps */
  overrides?: Record<string, unknown>;
  /** Face rendering side: 'front' | 'back' | 'double' */
  side?: 'front' | 'back' | 'double';
  /** Enable transparency */
  transparent?: boolean;
  /** Blending mode */
  blending?: 'normal' | 'additive';
  /** Render as wireframe */
  wireframe?: boolean;
  /** Use flat shading (hard polygon edges) */
  flatShading?: boolean;
}

/**
 * Structured PBR material values.
 * Numeric values are clamped to [0, 1] during resolution.
 */
export interface PbrValues {
  /** Base color as hex string (e.g., '#ff0000') */
  color?: string;
  /** Surface roughness: 0 = mirror, 1 = fully rough. Clamped to [0, 1]. */
  roughness?: number;
  /** Metalness: 0 = dielectric, 1 = fully metallic. Clamped to [0, 1]. */
  metalness?: number;
  /** Opacity: 0 = fully transparent, 1 = fully opaque. Clamped to [0, 1]. */
  opacity?: number;
  /** Emissive color as hex string */
  emissive?: string;
  /** Emissive intensity multiplier */
  emissive_intensity?: number;
}

/**
 * Context for material resolution, providing access to parent/sibling materials.
 */
export interface MaterialContext {
  /** Parent object's resolved material (for inherit: 'parent') */
  parentMaterial?: THREE.MeshStandardNodeMaterial;
  /** Map of scene objects by ID for cross-object inheritance */
  sceneObjects?: Map<string, { material?: MaterialDef }>;
  /** ID of the object being resolved (for error messages) */
  objectId?: string;
}

/**
 * Factory function that creates a configured MeshStandardNodeMaterial.
 * Accepts optional PBR overrides to apply on top of preset defaults.
 */
export type PresetFactory = (overrides?: PbrValues) => THREE.MeshStandardNodeMaterial;
