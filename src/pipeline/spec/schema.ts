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
  paths: z.record(z.string(), z.string()).optional(),
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
  overrides: z.record(z.string(), z.unknown()).optional(),
  side: z.enum(['front', 'back', 'double']).default('front'),
  transparent: z.boolean().optional(),
  blending: z.enum(['normal', 'additive']).default('normal'),
  wireframe: z.boolean().optional(),
  flatShading: z.boolean().optional(),
});

// ─── Object (recursive) ─────────────────────────────────────

export type ObjectInput = z.input<typeof BaseObjectSchema> & {
  children?: ObjectInput[];
};

const BaseObjectSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  style: z.enum([
    'realistic', 'stylized', 'cel-shaded', 'low-poly', 'voxel', 'wireframe',
  ]).optional(),
  generator: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  transform: TransformSchema.default({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
  }),
  material: MaterialDefSchema.optional(),
  textures: TextureDefSchema.optional(),
  animation: z.array(AnimationSchema).optional(),
  register_prefab: z.boolean().optional(),
  prefab_ref: z.string().optional(),
  instances: z.array(TransformSchema).optional(),
  lod: LodSchema.default('none'),
  collision: z.enum(['none', 'box', 'sphere', 'mesh', 'convex']).default('none'),
  visible: z.boolean().default(true),
  castShadow: z.boolean().default(true),
  receiveShadow: z.boolean().default(true),
});

/** Recursive object output type including optional children */
export type ObjectSchemaOutput = z.infer<typeof BaseObjectSchema> & {
  children?: ObjectSchemaOutput[];
};

export const ObjectSchema: z.ZodType<ObjectSchemaOutput> = BaseObjectSchema.extend({
  children: z.lazy(() => z.array(ObjectSchema)).optional(),
});

// ─── Fog ─────────────────────────────────────────────────────

export const FogSchema = z.object({
  type: z.enum(['linear', 'exponential']),
  color: z.string(),
  near: z.number().optional(),
  far: z.number().optional(),
  density: z.number().optional(),
});

// ─── Ambient ─────────────────────────────────────────────────

export const AmbientSchema = z.object({
  color: z.string().default('#ffffff'),
  intensity: z.number().default(0.5),
});

// ─── Environment ─────────────────────────────────────────────

export const EnvironmentSchema = z.object({
  description: z.string().optional(),
  background: z.string().default('#000000'),
  fog: FogSchema.optional(),
  ambient: AmbientSchema.default({ color: '#ffffff', intensity: 0.5 }),
  lights: z.array(LightSchema).default([]),
});

// ─── Camera ──────────────────────────────────────────────────

export const CameraSchema = z.object({
  position: Vec3Schema.default([0, 5, 10]),
  target: Vec3Schema.default([0, 0, 0]),
  fov: z.number().default(60),
  near: z.number().default(0.1),
  far: z.number().default(1000),
});

// ─── Meta ────────────────────────────────────────────────────

export const MetaSchema = z.object({
  name: z.string(),
  technique: z.string(),
  description: z.string(),
  author: z.string().optional(),
});

// ─── PrefabDef ───────────────────────────────────────────────

export const PrefabDefSchema = ObjectSchema;

// ─── Scene (top-level) ──────────────────────────────────────

export const SceneSchema = z.object({
  version: z.string().default('1.0'),
  meta: MetaSchema,
  camera: CameraSchema.default({
    position: [0, 5, 10],
    target: [0, 0, 0],
    fov: 60,
    near: 0.1,
    far: 1000,
  }),
  environment: EnvironmentSchema.default({
    background: '#000000',
    ambient: { color: '#ffffff', intensity: 0.5 },
    lights: [],
  }),
  objects: z.array(ObjectSchema).min(1),
  prefabs: z.record(z.string(), PrefabDefSchema).optional(),
});
