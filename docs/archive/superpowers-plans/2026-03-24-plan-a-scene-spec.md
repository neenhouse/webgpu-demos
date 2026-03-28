# Scene Description Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the scene YAML schema as TypeScript types, Zod validator, and YAML parser that other sub-projects consume.

**Architecture:** Zod schemas define the canonical types. A YAML parser loads .scene.yaml files, validates via Zod, and returns typed SceneGraph objects. Default values are applied during parsing. Error messages are field-level and descriptive.

**Tech Stack:** TypeScript, Zod, yaml (npm), Vitest (for testing)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/pipeline/spec/schema.ts` | Zod schemas for all types (Scene, Object, Material, Texture, Animation, Light, LodDef, Transform) |
| `src/pipeline/spec/types.ts` | TypeScript types inferred from Zod schemas (`z.infer<>`) |
| `src/pipeline/spec/parser.ts` | YAML loading + Zod validation + default application |
| `src/pipeline/spec/defaults.ts` | Default values for optional fields |
| `src/pipeline/spec/index.ts` | Public API exports |
| `src/pipeline/spec/__tests__/schema.test.ts` | Schema validation tests |
| `src/pipeline/spec/__tests__/parser.test.ts` | Parser integration tests |
| `src/pipeline/spec/__tests__/fixtures/valid-scene.scene.yaml` | Valid test fixture |
| `src/pipeline/spec/__tests__/fixtures/minimal-scene.scene.yaml` | Minimal valid scene (only required fields) |
| `src/pipeline/spec/__tests__/fixtures/invalid-scene.scene.yaml` | Invalid scene for rejection tests |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install zod, yaml, and vitest**

```bash
pnpm add zod yaml
pnpm add -D vitest
```

- [ ] **Step 2: Add a test script to package.json**

In `package.json`, add to the `"scripts"` section:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verify installation**

```bash
pnpm test -- --passWithNoTests
```

Expected: exits cleanly with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add zod, yaml, and vitest dependencies

Install zod for runtime schema validation, yaml for YAML parsing,
and vitest for unit testing. Add test and test:watch scripts."
```

---

### Task 2: Create Zod Schemas for Leaf Types (Transform, Light, Animation, LodDef)

**Files:**
- Create: `src/pipeline/spec/schema.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/pipeline/spec
```

- [ ] **Step 2: Create `src/pipeline/spec/schema.ts` with leaf-type schemas**

```typescript
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
```

- [ ] **Step 3: Verify the file compiles**

```bash
pnpm exec tsc --noEmit src/pipeline/spec/schema.ts --esModuleInterop --moduleResolution bundler --module esnext --target esnext --strict
```

This may produce import errors until the full project context is available, so alternatively just verify no syntax errors by checking the file is valid TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/spec/schema.ts
git commit -m "feat(spec): add Zod schemas for Transform, Light, Animation, LodDef

Leaf-type schemas that have no dependencies on other schema types.
Includes Vec3, Scale union (number | [x,y,z]), and sensible defaults."
```

---

### Task 3: Add Zod Schemas for TextureDef and MaterialDef

**Files:**
- Modify: `src/pipeline/spec/schema.ts`

- [ ] **Step 1: Add TextureDef schema**

Append to `src/pipeline/spec/schema.ts`:

```typescript
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
```

- [ ] **Step 2: Add PBR sub-schema and MaterialDef schema**

Append to `src/pipeline/spec/schema.ts`:

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/spec/schema.ts
git commit -m "feat(spec): add Zod schemas for TextureDef and MaterialDef

Mid-level types that reference primitives. Includes PBR sub-schema
with clamped [0,1] ranges, texture map enum, and material rendering hints."
```

---

### Task 4: Add Zod Schemas for Object (Recursive) and Scene (Top-Level)

**Files:**
- Modify: `src/pipeline/spec/schema.ts`

- [ ] **Step 1: Add the Object schema using `z.lazy()` for recursion**

Append to `src/pipeline/spec/schema.ts`:

```typescript
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
  params: z.record(z.unknown()).optional(),
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

export const ObjectSchema: z.ZodType<
  z.infer<typeof BaseObjectSchema> & { children?: z.infer<typeof BaseObjectSchema>[] }
> = BaseObjectSchema.extend({
  children: z.lazy(() => z.array(ObjectSchema)).optional(),
});
```

- [ ] **Step 2: Add the Scene top-level schema**

Append to `src/pipeline/spec/schema.ts`:

```typescript
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
  prefabs: z.record(PrefabDefSchema).optional(),
});
```

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/spec/schema.ts
git commit -m "feat(spec): add Zod schemas for Object (recursive), Scene, and supporting types

Object uses z.lazy() for recursive children. Scene is the top-level
schema with meta, camera, environment, objects, and optional prefabs.
Fog, Ambient, Camera, and Meta are supporting schemas."
```

---

### Task 5: Export Inferred TypeScript Types

**Files:**
- Create: `src/pipeline/spec/types.ts`

- [ ] **Step 1: Create `src/pipeline/spec/types.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/pipeline/spec/types.ts
git commit -m "feat(spec): export inferred TypeScript types from Zod schemas

All types derived via z.infer<> so they stay in sync with schemas
automatically. SceneGraph is an alias for Scene."
```

---

### Task 6: Implement Defaults Module

**Files:**
- Create: `src/pipeline/spec/defaults.ts`

- [ ] **Step 1: Create `src/pipeline/spec/defaults.ts`**

This module documents the canonical defaults for reference and provides a helper that deeply applies defaults to a parsed scene. Zod `.default()` handles most defaults during parsing, but this module provides explicit default constants and a post-parse helper for any defaults that are too complex for Zod.

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/pipeline/spec/defaults.ts
git commit -m "feat(spec): add canonical default values for optional fields

Constants for transform, camera, environment, object flags, material,
texture, and animation defaults. Used as reference by consumers and
editors; Zod applies these during validation."
```

---

### Task 7: Implement YAML Parser

**Files:**
- Create: `src/pipeline/spec/parser.ts`

- [ ] **Step 1: Create `src/pipeline/spec/parser.ts`**

```typescript
import { parse as parseYaml } from 'yaml';
import { SceneSchema } from './schema';
import type { Scene } from './types';

export interface ParseResult {
  success: true;
  scene: Scene;
}

export interface ParseError {
  success: false;
  errors: FieldError[];
}

export interface FieldError {
  path: string;
  message: string;
}

/**
 * Parse a YAML string into a validated Scene object.
 *
 * 1. Parses YAML text into a plain JS object
 * 2. Validates against the Zod SceneSchema
 * 3. Applies defaults for all optional fields (via Zod .default())
 * 4. Returns a typed Scene or descriptive field-level errors
 */
export function parseScene(yamlText: string): ParseResult | ParseError {
  // Step 1: Parse YAML
  let raw: unknown;
  try {
    raw = parseYaml(yamlText, { schema: 'core' });
  } catch (err) {
    return {
      success: false,
      errors: [
        {
          path: '',
          message: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  // Step 2: Validate with Zod (also applies defaults)
  const result = SceneSchema.safeParse(raw);

  if (!result.success) {
    const errors: FieldError[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return { success: false, errors };
  }

  // Step 3: Return typed scene (defaults already applied by Zod)
  return { success: true, scene: result.data };
}

/**
 * Parse a YAML string and throw on failure.
 * Convenience wrapper for use cases where errors are unexpected.
 */
export function parseSceneOrThrow(yamlText: string): Scene {
  const result = parseScene(yamlText);
  if (!result.success) {
    const messages = result.errors.map(
      (e) => (e.path ? `${e.path}: ${e.message}` : e.message),
    );
    throw new Error(`Scene validation failed:\n${messages.join('\n')}`);
  }
  return result.scene;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pipeline/spec/parser.ts
git commit -m "feat(spec): implement YAML parser with Zod validation

parseScene() loads YAML text, validates via Zod, applies defaults,
and returns typed Scene or field-level errors. parseSceneOrThrow()
is a convenience wrapper that throws on validation failure."
```

---

### Task 8: Create Public API Barrel Export

**Files:**
- Create: `src/pipeline/spec/index.ts`

- [ ] **Step 1: Create `src/pipeline/spec/index.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/pipeline/spec/index.ts
git commit -m "feat(spec): add barrel export for pipeline spec public API

Exports all schemas, inferred types, parser functions, and default
constants from a single entry point."
```

---

### Task 9: Create Test Fixtures

**Files:**
- Create: `src/pipeline/spec/__tests__/fixtures/valid-scene.scene.yaml`
- Create: `src/pipeline/spec/__tests__/fixtures/minimal-scene.scene.yaml`
- Create: `src/pipeline/spec/__tests__/fixtures/invalid-scene.scene.yaml`

- [ ] **Step 1: Create directories**

```bash
mkdir -p src/pipeline/spec/__tests__/fixtures
```

- [ ] **Step 2: Create `valid-scene.scene.yaml`** (exercises most features)

```yaml
version: "1.0"

meta:
  name: Test Junkyard
  technique: parametric + CSG
  description: A test scene with multiple object types
  author: test-suite

camera:
  position: [0, 8, 15]
  target: [0, 0, 0]
  fov: 55
  near: 0.1
  far: 500

environment:
  description: An abandoned junkyard at dusk
  background: "#1a1a2e"
  fog:
    type: linear
    color: "#1a1a2e"
    near: 20
    far: 100
  ambient:
    color: "#8899aa"
    intensity: 0.4
  lights:
    - type: directional
      position: [10, 20, 10]
      target: [0, 0, 0]
      color: "#ffddaa"
      intensity: 1.2
      castShadow: true
    - type: point
      position: [0, 3, 0]
      color: "#ff4400"
      intensity: 2
      distance: 15

objects:
  - id: ground
    prompt: flat cracked concrete ground plane
    style: realistic
    generator: parametric/terrain
    transform:
      position: [0, 0, 0]
      rotation: [0, 0, 0]
      scale: [20, 1, 20]
    material:
      preset: concrete-weathered
      pbr:
        roughness: 0.95
    lod: auto

  - id: car-wreck
    prompt: rusted abandoned sedan with flat tires and broken windows
    style: realistic
    generator: parametric/vehicle
    params:
      vehicle_type: sedan
      damage: heavy
    transform:
      position: [3, 0, -2]
      rotation: [0, 35, 0]
      scale: 1
    material:
      prompt: heavily rusted metal with peeling paint
      pbr:
        roughness: 0.85
        metalness: 0.6
        color: "#8B4513"
    castShadow: true
    receiveShadow: true
    children:
      - id: car-tire-fl
        prompt: flat deflated tire
        generator: parametric/debris
        transform:
          position: [-0.7, 0.2, 0.9]
          scale: 0.3
        material:
          preset: rubber-worn

  - id: barrel-stack
    prompt: stack of oil barrels
    style: realistic
    generator: csg
    transform:
      position: [-4, 0, 1]
    material:
      prompt: dented rusty metal barrel
      pbr:
        metalness: 0.7
        roughness: 0.8
    register_prefab: true
    instances:
      - position: [-4, 0, 1]
        rotation: [0, 0, 0]
        scale: 1
      - position: [-4, 0.8, 1]
        rotation: [0, 45, 0]
        scale: 1
      - position: [-3.5, 0, 2]
        rotation: [0, 15, 0]
        scale: 1

  - id: alien-plant
    prompt: bioluminescent alien plant with glowing tendrils
    style: stylized
    generator: sdf
    transform:
      position: [0, 0, 5]
      scale: 1.5
    material:
      shader: |
        mat.colorNode = mix(
          color(0x003300),
          color(0x00ff88),
          positionLocal.y.mul(0.5).add(0.5)
        );
        mat.emissiveNode = color(0x00ffcc).mul(
          oscSine(time.add(positionLocal.y.mul(3.0))).mul(0.5).add(0.5)
        );
    animation:
      - property: transform.rotation.y
        type: rotate
        speed: 0.1
        amplitude: 360
      - property: material.pbr.emissive_intensity
        type: pulse
        speed: 0.5
        amplitude: 1.5
        range: [0.3, 1.8]

  - id: glow-rock
    prompt: large mossy boulder
    style: realistic
    generator: parametric/rock
    transform:
      position: [-2, 0, -4]
      scale: 2
    material:
      preset: earth-dirt
      overrides:
        roughness: 0.95
    lod:
      levels:
        - distance: 0
          detail: 1.0
        - distance: 30
          detail: 0.5
        - distance: 80
          detail: 0.2
    collision: convex
```

- [ ] **Step 3: Create `minimal-scene.scene.yaml`** (only required fields)

```yaml
version: "1.0"

meta:
  name: Minimal Test
  technique: none
  description: Bare minimum scene

objects:
  - id: cube
    prompt: a simple cube
```

- [ ] **Step 4: Create `invalid-scene.scene.yaml`** (multiple errors)

```yaml
version: "1.0"

meta:
  name: Invalid Scene
  # missing: technique, description

objects:
  - id: bad-object
    # missing: prompt (required)
    material:
      pbr:
        roughness: 1.5
        metalness: -0.3
```

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/spec/__tests__/fixtures/
git commit -m "test(spec): add YAML test fixtures for valid, minimal, and invalid scenes

Three fixture files: a full-featured scene exercising most schema
fields, a minimal scene with only required fields, and an invalid
scene with missing required fields and out-of-range values."
```

---

### Task 10: Write Tests — Schema Validation

**Files:**
- Create: `src/pipeline/spec/__tests__/schema.test.ts`

- [ ] **Step 1: Create `src/pipeline/spec/__tests__/schema.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  TransformSchema,
  LightSchema,
  AnimationSchema,
  LodDefSchema,
  LodSchema,
  PbrSchema,
  MaterialDefSchema,
  TextureDefSchema,
  ObjectSchema,
  SceneSchema,
  Vec3Schema,
} from '../schema';

describe('Vec3Schema', () => {
  it('accepts a valid 3-number tuple', () => {
    expect(Vec3Schema.parse([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('rejects a 2-number tuple', () => {
    expect(() => Vec3Schema.parse([1, 2])).toThrow();
  });

  it('rejects non-numeric values', () => {
    expect(() => Vec3Schema.parse(['a', 'b', 'c'])).toThrow();
  });
});

describe('TransformSchema', () => {
  it('applies defaults for all fields', () => {
    const result = TransformSchema.parse({});
    expect(result).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    });
  });

  it('accepts uniform scale as number', () => {
    const result = TransformSchema.parse({ scale: 2 });
    expect(result.scale).toBe(2);
  });

  it('accepts per-axis scale as tuple', () => {
    const result = TransformSchema.parse({ scale: [1, 2, 3] });
    expect(result.scale).toEqual([1, 2, 3]);
  });
});

describe('LightSchema', () => {
  it('requires type', () => {
    expect(() => LightSchema.parse({})).toThrow();
  });

  it('accepts a valid directional light', () => {
    const result = LightSchema.parse({
      type: 'directional',
      position: [10, 20, 10],
      color: '#ffffff',
      intensity: 1.5,
    });
    expect(result.type).toBe('directional');
    expect(result.castShadow).toBe(false); // default
  });

  it('rejects an invalid light type', () => {
    expect(() => LightSchema.parse({ type: 'laser' })).toThrow();
  });
});

describe('AnimationSchema', () => {
  it('applies defaults for optional fields', () => {
    const result = AnimationSchema.parse({
      property: 'transform.rotation.y',
      type: 'rotate',
    });
    expect(result.speed).toBe(1);
    expect(result.amplitude).toBe(1);
    expect(result.delay).toBe(0);
    expect(result.loop).toBe(true);
  });

  it('rejects unknown animation type', () => {
    expect(() =>
      AnimationSchema.parse({ property: 'x', type: 'explode' }),
    ).toThrow();
  });
});

describe('LodSchema', () => {
  it('accepts "auto"', () => {
    expect(LodSchema.parse('auto')).toBe('auto');
  });

  it('accepts "none"', () => {
    expect(LodSchema.parse('none')).toBe('none');
  });

  it('accepts a LodDef object', () => {
    const result = LodSchema.parse({
      levels: [
        { distance: 0, detail: 1.0 },
        { distance: 50, detail: 0.5 },
      ],
    });
    expect(result).toEqual({
      levels: [
        { distance: 0, detail: 1.0 },
        { distance: 50, detail: 0.5 },
      ],
    });
  });

  it('rejects detail values outside [0, 1]', () => {
    expect(() =>
      LodDefSchema.parse({ levels: [{ distance: 0, detail: 1.5 }] }),
    ).toThrow();
  });
});

describe('PbrSchema', () => {
  it('rejects roughness > 1', () => {
    expect(() => PbrSchema.parse({ roughness: 1.5 })).toThrow();
  });

  it('rejects metalness < 0', () => {
    expect(() => PbrSchema.parse({ metalness: -0.3 })).toThrow();
  });

  it('accepts valid PBR values', () => {
    const result = PbrSchema.parse({
      color: '#ff0000',
      roughness: 0.5,
      metalness: 0.8,
      opacity: 1,
    });
    expect(result.roughness).toBe(0.5);
  });
});

describe('MaterialDefSchema', () => {
  it('applies defaults for side and blending', () => {
    const result = MaterialDefSchema.parse({});
    expect(result.side).toBe('front');
    expect(result.blending).toBe('normal');
  });

  it('accepts a full material definition', () => {
    const result = MaterialDefSchema.parse({
      prompt: 'shiny gold surface',
      preset: 'chrome',
      pbr: { color: '#ffd700', roughness: 0.1, metalness: 1.0 },
      side: 'double',
      transparent: true,
    });
    expect(result.preset).toBe('chrome');
    expect(result.pbr?.metalness).toBe(1.0);
  });
});

describe('TextureDefSchema', () => {
  it('applies defaults for resolution and tiling', () => {
    const result = TextureDefSchema.parse({});
    expect(result.resolution).toBe(1024);
    expect(result.tiling).toEqual([1, 1]);
    expect(result.source).toBe('procedural');
  });
});

describe('ObjectSchema', () => {
  it('requires id and prompt', () => {
    expect(() => ObjectSchema.parse({})).toThrow();
    expect(() => ObjectSchema.parse({ id: 'test' })).toThrow();
  });

  it('parses a minimal object with defaults', () => {
    const result = ObjectSchema.parse({ id: 'cube', prompt: 'a cube' });
    expect(result.id).toBe('cube');
    expect(result.visible).toBe(true);
    expect(result.castShadow).toBe(true);
    expect(result.receiveShadow).toBe(true);
    expect(result.lod).toBe('none');
    expect(result.collision).toBe('none');
    expect(result.transform).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    });
  });

  it('supports recursive children', () => {
    const result = ObjectSchema.parse({
      id: 'parent',
      prompt: 'a car',
      children: [
        {
          id: 'child',
          prompt: 'a wheel',
          children: [
            { id: 'grandchild', prompt: 'a hubcap' },
          ],
        },
      ],
    });
    expect(result.children).toHaveLength(1);
    expect(result.children![0].children).toHaveLength(1);
    expect(result.children![0].children![0].id).toBe('grandchild');
  });
});

describe('SceneSchema', () => {
  it('requires meta and objects', () => {
    expect(() => SceneSchema.parse({})).toThrow();
  });

  it('requires at least one object', () => {
    expect(() =>
      SceneSchema.parse({
        meta: { name: 'Test', technique: 'test', description: 'test' },
        objects: [],
      }),
    ).toThrow();
  });

  it('applies defaults for camera and environment', () => {
    const result = SceneSchema.parse({
      meta: { name: 'Test', technique: 'test', description: 'test' },
      objects: [{ id: 'cube', prompt: 'a cube' }],
    });
    expect(result.version).toBe('1.0');
    expect(result.camera.fov).toBe(60);
    expect(result.camera.position).toEqual([0, 5, 10]);
    expect(result.environment.background).toBe('#000000');
    expect(result.environment.ambient.intensity).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm test -- src/pipeline/spec/__tests__/schema.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/spec/__tests__/schema.test.ts
git commit -m "test(spec): add comprehensive schema validation tests

Tests cover all leaf types, mid-level types, recursive Object,
and top-level Scene. Validates defaults, required fields, range
constraints, and recursive children."
```

---

### Task 11: Write Tests — Parser Integration

**Files:**
- Create: `src/pipeline/spec/__tests__/parser.test.ts`

- [ ] **Step 1: Create `src/pipeline/spec/__tests__/parser.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseScene, parseSceneOrThrow } from '../parser';

const fixture = (name: string) =>
  readFileSync(
    resolve(__dirname, 'fixtures', name),
    'utf-8',
  );

describe('parseScene', () => {
  it('parses a valid full-featured scene', () => {
    const result = parseScene(fixture('valid-scene.scene.yaml'));
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.scene.meta.name).toBe('Test Junkyard');
    expect(result.scene.objects).toHaveLength(5);
    expect(result.scene.environment.lights).toHaveLength(2);
    expect(result.scene.camera.fov).toBe(55);
  });

  it('parses a minimal scene and applies all defaults', () => {
    const result = parseScene(fixture('minimal-scene.scene.yaml'));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const scene = result.scene;
    // Camera defaults
    expect(scene.camera.fov).toBe(60);
    expect(scene.camera.near).toBe(0.1);
    expect(scene.camera.far).toBe(1000);
    expect(scene.camera.position).toEqual([0, 5, 10]);

    // Environment defaults
    expect(scene.environment.background).toBe('#000000');
    expect(scene.environment.ambient.intensity).toBe(0.5);
    expect(scene.environment.lights).toEqual([]);

    // Object defaults
    const obj = scene.objects[0];
    expect(obj.visible).toBe(true);
    expect(obj.castShadow).toBe(true);
    expect(obj.receiveShadow).toBe(true);
    expect(obj.lod).toBe('none');
    expect(obj.collision).toBe('none');
    expect(obj.transform).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    });
  });

  it('rejects an invalid scene with field-level errors', () => {
    const result = parseScene(fixture('invalid-scene.scene.yaml'));
    expect(result.success).toBe(false);
    if (result.success) return;

    // Should have errors for missing required fields
    expect(result.errors.length).toBeGreaterThan(0);

    // Check that error paths are descriptive
    const paths = result.errors.map((e) => e.path);
    // meta.technique and meta.description are missing
    // objects.0.prompt is missing
    // PBR values out of range
    expect(
      result.errors.some((e) => e.path.includes('meta') || e.path.includes('objects')),
    ).toBe(true);
  });

  it('rejects broken YAML with a parse error', () => {
    const result = parseScene('{ invalid yaml: [');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0].message).toMatch(/YAML parse error/i);
  });

  it('handles recursive children in parsed YAML', () => {
    const yaml = `
version: "1.0"
meta:
  name: Recursive Test
  technique: test
  description: test
objects:
  - id: parent
    prompt: a car
    children:
      - id: child
        prompt: a wheel
        children:
          - id: grandchild
            prompt: a hubcap
`;
    const result = parseScene(yaml);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const parent = result.scene.objects[0];
    expect(parent.children).toHaveLength(1);
    expect(parent.children![0].id).toBe('child');
    expect(parent.children![0].children![0].id).toBe('grandchild');
  });
});

describe('parseSceneOrThrow', () => {
  it('returns a Scene for valid YAML', () => {
    const scene = parseSceneOrThrow(fixture('valid-scene.scene.yaml'));
    expect(scene.meta.name).toBe('Test Junkyard');
  });

  it('throws with descriptive message for invalid YAML', () => {
    expect(() => parseSceneOrThrow(fixture('invalid-scene.scene.yaml'))).toThrow(
      /Scene validation failed/,
    );
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/spec/__tests__/parser.test.ts
git commit -m "test(spec): add parser integration tests with YAML fixtures

Tests cover valid scene parsing, minimal scene with defaults,
invalid scene rejection with field-level errors, broken YAML
handling, recursive children, and the throw variant."
```

---

### Task 12: Final Verification and Commit

- [ ] **Step 1: Run all tests one final time**

```bash
pnpm test
```

Expected: all tests pass, zero failures.

- [ ] **Step 2: Verify build still works**

```bash
pnpm build
```

Expected: build succeeds. The pipeline spec files are pure TypeScript with no JSX, so they should compile cleanly alongside the existing React code.

- [ ] **Step 3: Verify the public API by checking imports**

Create a quick smoke test (then delete it) or simply verify that `src/pipeline/spec/index.ts` exports all the expected symbols by checking the TypeScript compiler:

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Final commit (if any fixups needed)**

If any fixes were needed during verification, commit them:

```bash
git add -A src/pipeline/spec/
git commit -m "fix(spec): address issues found during final verification"
```

If no fixes were needed, this step is a no-op.

---

## Task Dependency Order

```
Task 1 (install deps)
  └→ Task 2 (leaf schemas: Transform, Light, Animation, LodDef)
       └→ Task 3 (mid-level schemas: TextureDef, MaterialDef)
            └→ Task 4 (top-level schemas: Object, Scene)
                 ├→ Task 5 (TypeScript types)
                 ├→ Task 6 (defaults module)
                 ├→ Task 7 (YAML parser)
                 └→ Task 8 (barrel export)  [depends on 5, 6, 7]
                      └→ Task 9 (test fixtures)  [parallel with 10, 11]
                           ├→ Task 10 (schema tests)
                           └→ Task 11 (parser tests)  [depends on 9]
                                └→ Task 12 (final verification)
```

Tasks 5, 6, and 7 can run in parallel after Task 4. Task 8 depends on all three. Tasks 10 and 11 can run in parallel after Task 9.
