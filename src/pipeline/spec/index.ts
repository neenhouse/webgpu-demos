// ─── Schemas ─────────────────────────────────────────────────
export {
  Vec3Schema,
  ScaleSchema,
  TransformSchema,
  LightSchema,
  AnimationSchema,
  LodLevelSchema,
  LodDefSchema,
  LodSchema,
  TextureMapType,
  TextureDefSchema,
  PbrSchema,
  MaterialDefSchema,
  ObjectSchema,
  FogSchema,
  AmbientSchema,
  EnvironmentSchema,
  CameraSchema,
  MetaSchema,
  PrefabDefSchema,
  SceneSchema,
} from './schema';

// ─── Types ───────────────────────────────────────────────────
export type {
  Vec3,
  Transform,
  Light,
  Animation,
  LodLevel,
  LodDef,
  Lod,
  TextureDef,
  Pbr,
  MaterialDef,
  SceneObject,
  Fog,
  Ambient,
  Environment,
  Camera,
  Meta,
  Scene,
  SceneGraph,
} from './types';

// ─── Parser ──────────────────────────────────────────────────
export { parseScene, parseSceneOrThrow } from './parser';
export type { ParseResult, ParseError, FieldError } from './parser';

// ─── Defaults ────────────────────────────────────────────────
export {
  DEFAULT_TRANSFORM,
  DEFAULT_CAMERA,
  DEFAULT_ENVIRONMENT,
  DEFAULT_OBJECT_FLAGS,
  DEFAULT_MATERIAL,
  DEFAULT_TEXTURE,
  DEFAULT_ANIMATION,
} from './defaults';
