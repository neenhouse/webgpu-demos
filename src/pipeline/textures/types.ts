/**
 * Defines texture configuration for a material.
 */
export interface TextureDef {
  /** Natural language description for AI-driven texture generation */
  prompt?: string;
  /** Which texture maps to generate */
  maps?: ('albedo' | 'normal' | 'roughness' | 'metalness' | 'ao' | 'emission' | 'displacement')[];
  /** Texture resolution in pixels (default 1024) */
  resolution?: number;
  /** UV tiling repeat [u, v] (default [1, 1]) */
  tiling?: [number, number];
  /** Texture generation source */
  source?: 'procedural' | 'ai-generated' | 'file';
  /** File paths for file-based textures, keyed by map type */
  paths?: Record<string, string>;
}
