import { z } from 'zod';

// ─── Primitives ──────────────────────────────────────────────

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const ScaleSchema = z.union([
  z.number(),
  Vec3Schema,
]);

// ─── Transform ───────────────────────────────────────────────

export const TransformSchema = z.object({
  position: Vec3Schema.default([0, 0, 0]),
  rotation: Vec3Schema.default([0, 0, 0]),
  scale: ScaleSchema.default(1),
});

// ─── Light ───────────────────────────────────────────────────

export const LightSchema = z.object({
  type: z.enum(['directional', 'point', 'spot', 'hemisphere']),
  position: Vec3Schema.optional(),
  target: Vec3Schema.optional(),
  color: z.string().optional(),
  intensity: z.number().optional(),
  distance: z.number().optional(),
  angle: z.number().optional(),
  castShadow: z.boolean().default(false),
});

// ─── Animation ───────────────────────────────────────────────

export const AnimationSchema = z.object({
  property: z.string(),
  type: z.enum(['sine', 'bounce', 'rotate', 'sway', 'pulse', 'custom']),
  speed: z.number().default(1),
  amplitude: z.number().default(1),
  range: z.tuple([z.number(), z.number()]).optional(),
  delay: z.number().default(0),
  loop: z.boolean().default(true),
});

// ─── LodDef ──────────────────────────────────────────────────

export const LodLevelSchema = z.object({
  distance: z.number(),
  detail: z.number().min(0).max(1),
});

export const LodDefSchema = z.object({
  levels: z.array(LodLevelSchema).min(1),
});

export const LodSchema = z.union([
  z.literal('auto'),
  z.literal('none'),
  LodDefSchema,
]);

// ─── TextureDef ──────────────────────────────────────────────

export const TextureMapType = z.enum([
  'albedo', 'normal', 'roughness', 'metalness', 'ao', 'emission', 'displacement',
]);

export const TextureDefSchema = z.object({
  prompt: z.string().optional(),
  maps: z.array(TextureMapType).optional(),
  resolution: z.number().default(1024),
  tiling: z.tuple([z.number(), z.number()]).default([1, 1]),
  source: z.enum(['procedural', 'ai-generated', 'file']).default('procedural'),
  paths: z.record(z.string()).optional(),
});

// ─── MaterialDef ─────────────────────────────────────────────

export const PbrSchema = z.object({
  color: z.string().optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  emissive: z.string().optional(),
  emissive_intensity: z.number().optional(),
});

export const MaterialDefSchema = z.object({
  prompt: z.string().optional(),
  preset: z.string().optional(),
  pbr: PbrSchema.optional(),
  shader: z.string().optional(),
  inherit: z.string().optional(),
  overrides: z.record(z.unknown()).optional(),
  side: z.enum(['front', 'back', 'double']).default('front'),
  transparent: z.boolean().optional(),
  blending: z.enum(['normal', 'additive']).default('normal'),
  wireframe: z.boolean().optional(),
  flatShading: z.boolean().optional(),
});
