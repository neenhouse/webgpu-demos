import { z } from 'zod';
import {
  Vec3Schema,
  TransformSchema,
  LightSchema,
  AnimationSchema,
  LodLevelSchema,
  LodDefSchema,
  LodSchema,
  TextureDefSchema,
  PbrSchema,
  MaterialDefSchema,
  ObjectSchema,
  FogSchema,
  AmbientSchema,
  EnvironmentSchema,
  CameraSchema,
  MetaSchema,
  SceneSchema,
} from './schema';

// ─── Inferred Types ──────────────────────────────────────────

export type Vec3 = z.infer<typeof Vec3Schema>;
export type Transform = z.infer<typeof TransformSchema>;
export type Light = z.infer<typeof LightSchema>;
export type Animation = z.infer<typeof AnimationSchema>;
export type LodLevel = z.infer<typeof LodLevelSchema>;
export type LodDef = z.infer<typeof LodDefSchema>;
export type Lod = z.infer<typeof LodSchema>;
export type TextureDef = z.infer<typeof TextureDefSchema>;
export type Pbr = z.infer<typeof PbrSchema>;
export type MaterialDef = z.infer<typeof MaterialDefSchema>;
export type SceneObject = z.infer<typeof ObjectSchema>;
export type Fog = z.infer<typeof FogSchema>;
export type Ambient = z.infer<typeof AmbientSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type Camera = z.infer<typeof CameraSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type Scene = z.infer<typeof SceneSchema>;

// Alias for consumers that expect "SceneGraph"
export type SceneGraph = Scene;
