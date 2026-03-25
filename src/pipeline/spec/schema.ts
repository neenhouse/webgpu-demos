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
