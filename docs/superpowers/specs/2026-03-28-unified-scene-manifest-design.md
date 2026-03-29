# Unified Scene Manifest — Design Spec

> **Status**: APPROVED
> **Date**: 2026-03-28

## Overview

Introduce a `manifest.yaml` for every demo — a uniform metadata + environment layer that provides declarative consistency across both YAML scene demos and imperative React/TSL component demos. Two rendering paths coexist: `type: scene` (declarative YAML pipeline) and `type: component` (React/TSL code). The manifest becomes the single source of truth for gallery metadata, search/filter tags, quality declarations, and AI generation briefs.

## Problem

The project has two disconnected creation systems:
- **11 scene demos** use a declarative YAML pipeline (scene-pipeline-spec-v1.md) with generators, materials, and Zod validation
- **135 effect demos** are hand-coded React/TSL components with no declarative description, no quality schema, and no structured metadata beyond the registry entry

The registry (`src/lib/registry.ts`) is a 600+ line hardcoded array that duplicates metadata. Tags were bolted on after the fact. There's no structured way to describe what techniques a demo uses, what quality rules apply, or how to generate a similar demo.

## Design

### Manifest Format (v2.0)

Every demo gets a file at `manifests/<demo-name>.manifest.yaml`:

```yaml
version: "2.0"

meta:
  name: boids-murmuration              # REQUIRED. URL slug.
  title: Boids Murmuration             # REQUIRED. Display name.
  description: >                        # REQUIRED. One-line summary.
    10,000 bird-like particles flocking via GPU compute
    with separation, alignment, and cohesion rules
  tags: [emergent, compute]             # REQUIRED. From taxonomy.
  color: "#6644ff"                      # REQUIRED. Accent color for gallery card.
  requiresWebGPU: true                  # REQUIRED. Compute/storage buffer demos.

renderer:
  type: component                       # REQUIRED. "component" or "scene"
  module: boids-murmuration             # For component type: demo slug (maps to src/demos/<slug>/)
  # scene: boids.scene.yaml            # For scene type: path relative to public/scenes/

camera:                                  # Optional. Defaults applied if component doesn't set its own.
  position: [0, 0, 4]
  target: [0, 0, 0]
  fov: 70

environment:                             # Optional. Defaults applied if component doesn't set its own.
  background: "#000000"
  ambient:
    color: "#334466"
    intensity: 0.1
  lights:
    - type: point
      position: [0, 0, 0]
      color: "#6644ff"
      intensity: 5.0
      distance: 15
    - type: point
      position: [4, 3, 4]
      color: "#22ccbb"
      intensity: 3.0
      distance: 12

techniques:                              # Optional. Documents what this demo showcases.
  - compute-shader
  - instanced-mesh
  - gpu-physics
  - flocking-algorithm

quality:                                 # Optional. Quality gate declarations.
  complexity: advanced                   # basic | intermediate | advanced
  min_lines: 200                         # Minimum source lines (batch 4+ rule)
```

### Manifest Schema (Zod)

New file `src/pipeline/spec/manifest-schema.ts`:

```typescript
import { z } from 'zod';

const TAG_TAXONOMY = [
  'tsl', 'shader-art', 'compute', 'scene', 'emergent', 'data-viz',
  'audio', 'physics', 'procedural', 'retro', 'organic', 'math', 'game-ready'
] as const;

const TECHNIQUES = [
  'compute-shader', 'instanced-mesh', 'gpu-physics', 'flocking-algorithm',
  'tsl-material', 'sdf-raymarching', 'screen-space-effect', 'skeletal-animation',
  'volumetric-shells', 'particle-system', 'fresnel', 'hash-noise',
  'verlet-integration', 'wave-equation', 'l-system', 'dla-growth',
  'fractal-rendering', 'parametric-surface', 'cel-shading', 'shadow-mapping',
  'ssao', 'pbr-exploration', 'deferred-rendering', 'gpu-culling',
  'csg-boolean', 'scene-composition', 'data-visualization', 'interactive-ui',
  'camera-transitions', 'html-overlays', 'audio-simulation',
] as const;

export const ManifestSchema = z.object({
  version: z.literal('2.0'),
  meta: z.object({
    name: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    description: z.string().min(10),
    tags: z.array(z.enum(TAG_TAXONOMY)).min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    requiresWebGPU: z.boolean(),
  }),
  renderer: z.discriminatedUnion('type', [
    z.object({ type: z.literal('component'), module: z.string() }),
    z.object({ type: z.literal('scene'), scene: z.string() }),
  ]),
  camera: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]).optional(),
    target: z.tuple([z.number(), z.number(), z.number()]).optional(),
    fov: z.number().optional(),
  }).optional(),
  environment: z.object({
    background: z.string().optional(),
    ambient: z.object({
      color: z.string().optional(),
      intensity: z.number().optional(),
    }).optional(),
    lights: z.array(z.object({
      type: z.enum(['directional', 'point', 'spot', 'hemisphere']),
      position: z.tuple([z.number(), z.number(), z.number()]).optional(),
      target: z.tuple([z.number(), z.number(), z.number()]).optional(),
      color: z.string().optional(),
      intensity: z.number().optional(),
      distance: z.number().optional(),
    })).optional(),
  }).optional(),
  techniques: z.array(z.enum(TECHNIQUES)).optional(),
  quality: z.object({
    complexity: z.enum(['basic', 'intermediate', 'advanced']).optional(),
    min_lines: z.number().optional(),
  }).optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
```

### Registry Refactor

Replace the hardcoded `demos` array in `src/lib/registry.ts` with a manifest-driven registry:

**Phase 1 (this spec):** Generate 146 manifest files from the current registry data. Build a `loadManifests()` function that reads them at build time (Vite plugin or build script) and produces the same `DemoEntry[]` shape the gallery and viewer consume. The registry.ts file becomes a thin adapter.

**Phase 2 (future):** Remove registry.ts entirely. The manifest directory IS the registry. Vite plugin glob-imports `manifests/*.manifest.yaml`, validates each with Zod, and generates the typed registry at build time.

### Rendering Paths

**Scene mode (`renderer.type: scene`):**
```
manifest.yaml → load scene YAML → SceneFromYaml pipeline
                 Camera from manifest.camera
                 Environment from manifest.environment
                 Objects from scene YAML
```

**Component mode (`renderer.type: component`):**
```
manifest.yaml → lazy(() => import(`../demos/${module}`))
                 Camera: manifest provides defaults; component can override
                 Environment: manifest provides defaults; component can override
                 The component has full control
```

For component mode, the Viewer applies manifest camera/environment as initial values. If the component renders its own lights or sets camera position in `useFrame`, those take precedence. This avoids redundant/conflicting declarations.

### Quality Gates

**Level 1: Manifest validation (all demos)**
- Zod schema validates every manifest at build time
- Required fields: name, title, description, tags (from taxonomy), color, requiresWebGPU
- Tags must be from the fixed taxonomy
- Name must match the directory slug

**Level 2: Component linting (component-mode demos)**
- ESLint plugin or build-time script checks `.tsx` files for playbook violations:
  - `emissiveIntensity > 3.0` → warning
  - `PointsNodeMaterial` / `SpriteNodeMaterial` → error
  - `BoxGeometry` with material array → error
  - `viewportResolution` → error (use `screenSize`)
  - `DoubleSide` on additive shells → warning
- These rules come from `docs/ralph-specs/batch-playbook.md` and `learnings.md`

**Level 3: Manifest completeness scoring**
- A build-time report shows which demos have incomplete manifests (missing techniques, no camera, no environment)
- Not a hard gate — just visibility

### AI Generation Brief

The manifest doubles as a generation brief for AI subagents. When creating a new demo, the agent receives:

1. The manifest (what to build — name, description, tags, techniques, complexity)
2. The learnings.md (how to build — proven patterns, broken patterns)
3. The batch-playbook.md (quality rules)
4. The manifest schema (validation contract)

For scene-mode: the agent generates a `.scene.yaml` against the Scene Pipeline Spec v1.0.
For component-mode: the agent generates a React/TSL component at `src/demos/<slug>/index.tsx`.

Both paths produce a validated manifest as a side effect.

### Engine Portability

- **Scene-mode demos:** Fully portable. The manifest + scene YAML contain everything another engine needs.
- **Component-mode demos:** The manifest is portable (camera, environment, metadata, techniques, description). The component code is Three.js/R3F-specific. Another engine reads the manifest to understand intent and provides its own implementation.
- **The manifest is the engine-agnostic contract.** The rendering path is the engine-specific implementation.

### Directory Structure

```
manifests/
  tsl-torus.manifest.yaml
  boids-murmuration.manifest.yaml
  test-scene.manifest.yaml
  ... (146 files)

src/demos/
  tsl-torus/index.tsx          # component-mode demos (unchanged)
  boids-murmuration/index.tsx
  test-scene/index.tsx         # thin wrapper: <SceneFromYaml ... />
  ...

public/scenes/
  test-scene.scene.yaml        # scene-mode YAML files (unchanged)
  enchanted-forest.scene.yaml
  ...
```

### Migration Plan

1. **Generate manifests:** Script reads current registry.ts entries and writes 146 `manifests/*.manifest.yaml` files. Scene demos get `renderer.type: scene`, all others get `renderer.type: component`.
2. **Add manifest schema:** New `src/pipeline/spec/manifest-schema.ts` with Zod validation.
3. **Build-time validation:** Vite plugin or build script validates all manifests on `pnpm build`.
4. **Registry adapter:** `registry.ts` reads manifests (build-time generated) instead of hardcoded array.
5. **Tests:** Validate every manifest passes schema, every manifest slug matches a demo directory, every tag is from taxonomy.
6. **No component changes.** Existing demo `.tsx` files are untouched.

### What This Does NOT Do

- Does not change how any demo renders
- Does not require rewriting component-mode demos
- Does not force YAML on shader art demos
- Does not create a new programming language
- Does not promise full engine portability for component-mode demos (that would be dishonest)

### Future Extensions

- **Manifest-driven thumbnail capture:** The manifest's camera and environment provide the capture setup
- **Manifest-driven gallery:** FilterBar reads tags directly from manifests instead of registry
- **Forge integration:** `forge:drive` reads manifests to assess demo inventory, quality coverage, and missing metadata
- **SDK extraction:** The manifest schema + scene spec + generator interfaces become the portable SDK package
