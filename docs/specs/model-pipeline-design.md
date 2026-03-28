---
title: AI-Driven 3D Model Rendering Pipeline
status: IMPLEMENTED
created: 2026-03-24
features: [Model Pipeline, Scene Spec, Geometry Generators, Material Pipeline, Prefab System, LOD, Asset Optimization]
---

# AI-Driven 3D Model Rendering Pipeline

## Overview

A prompt-driven 3D model generation pipeline that takes natural language descriptions and produces fully rendered WebGPU scenes. The pipeline supports four fidelity tiers (CSG, parametric, SDF, AI code gen) with a future fifth tier (Tripo3D import). Each demo showcases its technique. The scene description format (YAML) is the extractable specification for use in other projects.

## Goals

1. Any object describable in English can be generated as a 3D model
2. Multiple fidelity tiers, each demo labels its technique
3. High-fidelity PBR materials and textures from natural language
4. Scene format is human-readable, AI-editable, and engine-agnostic
5. Extractable as a spec + reference implementation for other projects
6. Performant via GPU instancing, LOD, and asset optimization

## Architecture

```
User/Ralph Prompt
    ↓
Scene Description (YAML)     ← the extractable spec
    ↓
Scene Renderer                ← reads YAML, orchestrates everything
    ├── Geometry Generators   ← CSG, Parametric, SDF, AI Code Gen, (Tripo)
    ├── Material Pipeline     ← PBR presets, prompt-to-material, inline TSL
    ├── Texture Pipeline      ← procedural textures, (AI-generated future)
    ├── Prefab Registry       ← reusable object templates
    ├── LOD Generator         ← auto detail levels
    └── Asset Optimizer       ← mesh simplification, dedup, compression
    ↓
WebGPU/WebGL Rendered Scene
```

## New Dependencies

| Package | Purpose |
|---------|---------|
| `yaml` | YAML parsing (scene files). Chosen over JSON for readability and multi-line string support (`\|` blocks for shader code, prompts). |
| `zod` | Runtime schema validation for scene YAML — produces clear error messages for invalid scenes |
| `three-bvh-csg` | CSG boolean operations (must validate against Three.js r183 + WebGPU before committing) |

YAML is preferred over JSON because scene files contain multi-line prompts, inline shader code, and deeply nested structures that benefit from YAML's block scalar syntax. The `yaml` npm package handles type coercion safely when configured with `schema: 'core'`.

## Sub-Project Decomposition

Seven independent sub-projects that can be implemented in parallel where noted.

### Sub-Project 1: Scene Description Spec

**Depends on:** Nothing (foundational)
**Parallel with:** Everything else (define first, implement consumers in parallel)

The YAML schema that describes a complete 3D scene. This is the extractable artifact.

#### Top-Level Structure

```yaml
version: "1.0"

meta:
  name: string           # scene display name
  technique: string      # fidelity label shown in demo overlay
  description: string    # one-line summary
  author: string         # who/what generated it

camera:
  position: [x, y, z]
  target: [x, y, z]
  fov: number            # degrees, default 60
  near: number           # default 0.1
  far: number            # default 1000

environment:
  description: string    # natural language for AI generation
  background: string     # hex color or "transparent"
  fog:
    type: linear | exponential
    color: string
    near: number         # linear only
    far: number          # linear only
    density: number      # exponential only
  ambient:
    color: string
    intensity: number
  lights: Light[]

objects: Object[]

prefabs: Record<string, PrefabDef>
```

#### Object Schema

```yaml
Object:
  id: string                    # unique identifier within scene
  prompt: string                # PRIMARY: natural language description
  style: string                 # realistic | stylized | cel-shaded | low-poly | voxel | wireframe
  generator: string             # hint: csg | parametric/<category> | sdf | codegen | tripo

  # Optional structured params (refine prompt interpretation)
  params: Record<string, any>   # generator-specific parameters

  transform:
    position: [x, y, z]        # default [0,0,0]
    rotation: [x, y, z]        # degrees, default [0,0,0]
    scale: number | [x, y, z]  # uniform or per-axis, default 1

  material: MaterialDef
  textures: TextureDef

  children: Object[]            # sub-objects for complex models

  animation: Animation[]        # optional animations

  register_prefab: boolean      # true = register this object as a reusable prefab
  prefab_ref: string            # reference an existing prefab by id
  instances: Transform[]        # GPU-instanced placements

  lod: "auto" | "none" | LodDef  # level of detail
  collision: "none" | "box" | "sphere" | "mesh" | "convex"  # reserved for future physics

  visible: boolean              # default true
  castShadow: boolean           # default true
  receiveShadow: boolean        # default true
```

#### Composition Rules (Children)

- Children transforms are **parent-local** (position [1,0,0] means 1 unit from parent origin, not world origin)
- Children **inherit `style`** from parent unless they specify their own
- Children do **NOT inherit `generator`** — each child must specify its own or rely on auto-selection
- Children **inherit `material`** only when explicitly declared: `material: { inherit: parent }`
- Children can override any inherited material property via `overrides`

#### Error Handling & Fallbacks

- **Generator failure** (degenerate geometry, crash): render a bright magenta wireframe cube at the object's position as a visible error marker
- **Unknown material preset**: fall back to default grey `MeshStandardNodeMaterial` with console warning
- **Unknown prefab reference**: skip the object, log error with the `prefab_ref` value
- **Invalid PBR values** (e.g., roughness > 1): clamp to valid range [0, 1]
- **YAML parse error**: reject the entire scene with a descriptive error message
- **Missing required fields** (`id`, `prompt`): reject with field-level error

#### Material Schema

```yaml
MaterialDef:
  prompt: string                # natural language material description
  preset: string                # optional: named preset from material library

  # Structured PBR values (optional, supplement/override prompt)
  pbr:
    color: string               # hex or CSS color
    roughness: number           # 0-1
    metalness: number           # 0-1
    opacity: number             # 0-1
    emissive: string            # hex color
    emissive_intensity: number  # multiplier

  # Custom TSL shader code (when presets aren't enough)
  shader: string                # inline TSL code block

  # Inheritance (see resolution order below)
  inherit: "parent" | string    # inherit from parent object or named object
  overrides: Record<string, any>  # override specific inherited properties

  # Rendering hints
  side: "front" | "back" | "double"  # default "front"
  transparent: boolean
  blending: "normal" | "additive"    # default "normal"
  wireframe: boolean
  flatShading: boolean
```

#### Material Resolution Order

Materials resolve in this priority (later overrides earlier):

1. **`inherit`** — if set, start with the referenced object's resolved material
2. **`preset`** — if set, load the named preset as a base
3. **`pbr`** — override specific PBR values on the base
4. **`prompt`** — AI interprets this to fill any remaining unset PBR values
5. **`shader`** — if set, **replaces the entire node graph** (overrides everything above for colorNode/emissiveNode/etc). PBR values like roughness/metalness still apply alongside the shader.
6. **`overrides`** — applied last (for inheritance scenarios)

**Shader is atomic** — you cannot inherit a shader and override individual lines. If a child needs a slightly different shader, it must provide a complete new shader block.

#### Animation Property Targets

Valid `property` values in the Animation schema:

- `transform.position.x`, `transform.position.y`, `transform.position.z` — translate
- `transform.rotation.x`, `transform.rotation.y`, `transform.rotation.z` — rotate (degrees)
- `transform.scale` — uniform scale
- `material.pbr.emissive_intensity` — emissive pulse
- `material.pbr.opacity` — fade in/out
- `material.pbr.roughness`, `material.pbr.metalness` — surface variation
- `visibility` — show/hide toggle

Nested paths are resolved by the animation system. Unknown properties are silently ignored.

#### Texture Schema

```yaml
TextureDef:
  prompt: string                # describes what textures should look like
  maps:                         # which PBR texture maps to generate
    - albedo
    - normal
    - roughness
    - metalness
    - ao                        # ambient occlusion
    - emission
    - displacement
  resolution: number            # pixels, default 1024
  tiling: [x, y]               # UV tiling, default [1, 1]
  source: "procedural" | "ai-generated" | "file"
  paths:                        # if source is "file"
    albedo: string
    normal: string
    # ...
```

#### Animation Schema

```yaml
Animation:
  property: string              # what to animate
  type: string                  # sine | bounce | rotate | sway | pulse | custom
  speed: number                 # cycles per second
  amplitude: number             # magnitude of effect
  range: [min, max]             # value range
  delay: number                 # seconds before starting
  loop: boolean                 # default true
```

#### Light Schema

```yaml
Light:
  type: directional | point | spot | hemisphere
  position: [x, y, z]
  target: [x, y, z]            # directional/spot only
  color: string
  intensity: number
  distance: number              # point/spot only
  angle: number                 # spot only, degrees
  castShadow: boolean
```

#### LodDef Schema

```yaml
LodDef:
  levels:
    - distance: number          # camera distance threshold
      detail: number            # 0-1, proportion of original detail
    - distance: 50
      detail: 0.5
    - distance: 100
      detail: 0.2
```

### Sub-Project 2: Geometry Generators

**Depends on:** Scene Spec (schema definition)
**Parallel with:** Material Pipeline, Prefab System, Asset Optimizer

Four geometry generation tiers, each as an independent module with a common interface.

#### Common Generator Interface

```typescript
interface GeneratorResult {
  geometry: THREE.BufferGeometry;       // mesh output (bounding box for SDF)
  material?: THREE.Material;           // optional: SDF generators provide their own material
  isSdf?: boolean;                     // if true, scene renderer skips material pipeline
  metadata: {
    vertexCount: number;
    faceCount: number;
    generator: string;
    prompt: string;
    generationTime: number;            // ms
  };
}

interface Generator {
  name: string;
  canHandle(object: SceneObject): number;  // confidence 0-1 (0 = can't handle, 1 = perfect match)
  generate(object: SceneObject): GeneratorResult;
}
```

#### Tier 1: CSG Generator

`src/pipeline/generators/csg.ts`

Constructive Solid Geometry — boolean operations on primitives.

**Best for:** Mechanical objects, architecture, furniture, barriers, containers.

**Approach:**
- Expose primitives: box, sphere, cylinder, cone, torus
- Boolean operations: union, subtract, intersect
- Can be defined in scene YAML as structured operations OR generated by Ralph from the prompt
- Use Three.js CSG library (three-bvh-csg or similar)

**Scene spec support:**

```yaml
generator: csg
params:
  operations:
    - union:
        - box: [2, 0.8, 0.4]
        - cylinder: [0.1, 1]
          position: [0.5, 0, 0]
    - subtract:
        - sphere: [0.3]
          position: [0, 0.4, 0.2]
```

OR just use the prompt and let Ralph generate the operations.

#### Tier 2: Parametric Generators

`src/pipeline/generators/parametric/`

Category-specific generators with rich parameter control.

**Categories to build:**

| Category | File | Handles |
|----------|------|---------|
| `vehicle` | `vehicle.ts` | Cars, trucks, motorcycles |
| `character` | `character.ts` | Humanoids, creatures, robots |
| `vegetation` | `vegetation.ts` | Trees, bushes, grass, flowers |
| `terrain` | `terrain.ts` | Ground planes, hills, cliffs |
| `rock` | `rock.ts` | Rocks, boulders, rubble |
| `building` | `building.ts` | Structures, walls, ruins |
| `furniture` | `furniture.ts` | Tables, chairs, shelves |
| `debris` | `debris.ts` | Tires, barrels, crates, pipes |
| `weapon` | `weapon.ts` | Swords, guns, shields |
| `organic` | `organic.ts` | Mushrooms, corals, alien life |

**Each generator:**
- Takes a prompt + optional params
- Returns BufferGeometry with UVs suitable for texturing
- Supports a `style` parameter that affects polygon count and edge treatment
- Ralph maps prompt to params via the generator's documented parameter list

**Parametric generators produce prefab-ready meshes** — once generated with specific params, the result is registered in the prefab registry for instancing.

#### Tier 3: SDF Raymarching Generator

`src/pipeline/generators/sdf.ts`

Signed Distance Field shapes rendered via TSL raymarching in the fragment shader.

**Best for:** Organic, alien, abstract, sci-fi, anything hard to mesh. Infinite variety from math.

**Approach:**
- The SDF generator **returns both geometry AND material** (`isSdf: true` in GeneratorResult). The scene renderer skips the separate material pipeline for SDF objects.
- Geometry: a bounding box mesh sized to contain the SDF shape
- Material: a `MeshBasicNodeMaterial` with a raymarching fragment shader that evaluates the SDF
- Ralph writes SDF composition in the scene YAML `material.shader` field, which the SDF generator reads and compiles into the raymarching material
- Built-in SDF primitives library: sphere, box, torus, cylinder, cone, capsule
- Built-in SDF operations: union, smooth_union, subtract, intersect, repeat, twist, bend
- Ralph composes these into complex shapes via prompt interpretation
- **Color/material for SDF objects is embedded in the SDF shader** (e.g., color based on distance field value, position, or normal) — not in the separate MaterialDef

**SDF primitives and ops are provided as importable TSL functions:**

```typescript
// src/pipeline/generators/sdf-lib.ts
export const sdfSphere = (p, r) => length(p).sub(r);
export const sdfBox = (p, b) => { /* ... */ };
export const sdfSmoothUnion = (d1, d2, k) => { /* ... */ };
export const sdfTwist = (p, k) => { /* ... */ };
// etc.
```

#### Tier 4: AI Code Generation

`src/pipeline/generators/codegen.ts`

Ralph generates raw Three.js geometry code for one-off objects that don't fit categories.

**Best for:** Unique objects, manufactured items with specific shapes (Victorian lamp, ornate gate, musical instrument).

**Approach:**
- Ralph reads the prompt and writes a factory function
- Uses: ExtrudeGeometry (from 2D Shape paths), LatheGeometry (revolution profiles), TubeGeometry (along curves), parametric BufferGeometry with custom vertex positions
- Generated code lives in `src/pipeline/generated/<scene-name>/<object-id>.ts`
- Scene renderer lazy-loads the generated factory function

**Scene spec support:**

```yaml
generator: codegen
params:
  source: "generated/junkyard/victorian-lamp.ts"  # path to generated factory
```

#### Tier 5: Tripo3D Import (Future)

`src/pipeline/generators/tripo.ts`

Import meshes from Tripo3D API.

**Approach:**
- API adapter with swappable provider (Tripo3D now, Meshy/others later)
- Prompt sent to API, .glb returned, loaded via GLTFLoader
- Cached locally after first generation
- Falls back to Tier 4 (AI code gen) if API unavailable

**Scene spec support:**

```yaml
generator: tripo
params:
  api_prompt: "detailed police car, photorealistic"  # may differ from display prompt
  cache_key: "police-car-v1"
```

#### Generator Selection Logic

When Ralph creates a scene, it selects a generator per object:

```
prompt analysis
  ├── matches a parametric category? → Tier 2 (parametric)
  ├── organic/abstract/alien/sci-fi? → Tier 3 (SDF)
  ├── mechanical/simple shapes? → Tier 1 (CSG)
  ├── unique manufactured object? → Tier 4 (AI code gen)
  └── photorealistic + API available? → Tier 5 (Tripo)
```

The `generator` field in the scene spec is a **hint** — Ralph chooses it, but could be overridden.

### Sub-Project 3: Material & Texture Pipeline

**Depends on:** Scene Spec (schema)
**Parallel with:** Geometry Generators, Prefab System

#### Material System

`src/pipeline/materials/`

Three material strategies, selected based on the scene object's material definition:

**1. Preset Materials** (`src/pipeline/materials/presets/`)

A library of named PBR material configs for common surfaces:

| Preset | Properties |
|--------|-----------|
| `rusted-metal` | High roughness, medium metalness, orange-brown color variation |
| `concrete-weathered` | High roughness, no metalness, grey with dirt variation |
| `rubber-worn` | High roughness, no metalness, dark grey-black |
| `glass-clear` | Low roughness, no metalness, high transmission |
| `glass-frosted` | Medium roughness, no metalness, translucent |
| `wood-oak` | Medium roughness, no metalness, warm brown tones |
| `fabric-rough` | High roughness, no metalness, various colors |
| `skin-organic` | Medium roughness, subsurface hint, flesh tones |
| `chrome` | Very low roughness, full metalness, mirror-like |
| `plastic-glossy` | Low roughness, no metalness, various colors |
| `earth-dirt` | High roughness, dark brown, displacement |
| `water-surface` | Low roughness, slight metalness, transparent blue |
| `neon-glow` | Emissive-driven, various colors |
| `holographic` | Iridescent, view-angle color shift |
| `cel-shaded` | Flat shading, hard shadow boundaries, outline |

Each preset is a function returning a `MeshStandardNodeMaterial` with TSL nodes configured.

Presets accept `overrides` — any PBR property can be adjusted per-instance.

**2. Prompt-Driven Materials**

When no preset matches, Ralph interprets the material prompt and generates:
- PBR values (roughness, metalness, color, emissive)
- TSL node configuration (color nodes, emissive nodes, position displacement)
- Texture generation instructions

The material prompt is the primary input. Structured `pbr` values are optional refinements.

**3. Custom TSL Shaders**

For materials that can't be expressed as PBR values (iridescent, holographic, dissolving, screen-space effects), the scene spec supports inline TSL code:

```yaml
material:
  shader: |
    mat.colorNode = mix(
      color(0x220044),
      color(0x00ffcc),
      veinPattern(positionLocal, time)
    );
    mat.emissiveNode = color(0x00ffcc).mul(pulse(time));
```

The material pipeline compiles this into a `MeshStandardNodeMaterial`.

#### Texture Pipeline

`src/pipeline/textures/`

**Phase 1 (Now): Procedural Textures**

TSL-driven textures generated at render time:
- Noise-based patterns (hash, Perlin-like via layered sine)
- Pattern generators (checkerboard, stripes, brick, scales)
- Weathering effects (rust, dirt, scratches, moss)
- All driven by the texture `prompt` field

**Phase 2 (Future): AI-Generated Textures**

When AI image generation APIs are available:
- Send texture prompt to API (Stable Diffusion, DALL-E, etc.)
- Receive PBR texture maps (albedo, normal, roughness, etc.)
- Cache locally for reuse
- Fall back to procedural if API unavailable

#### Material Inheritance

Objects can inherit materials from parents or named objects:

```yaml
material:
  inherit: parent
  overrides:
    roughness: 0.9    # more worn than parent
```

This is resolved at render time — the renderer copies the parent material and applies overrides.

### Sub-Project 4: Scene Renderer

**Depends on:** Scene Spec, Geometry Generators, Material Pipeline
**Parallel with:** Prefab System, LOD, Asset Optimizer (interfaces defined upfront)

`src/pipeline/renderer/`

The orchestration layer that reads a scene YAML file and produces a rendered Three.js scene.

#### Rendering Pipeline

```
1. Parse YAML → SceneGraph (typed objects) — validated via Zod schema
2. Resolve prefabs (expand prefab_ref references from registry)
3. For each object:
   a. Select generator (from hint or auto-detect via confidence scores)
   b. Generate geometry (returns GeneratorResult)
   c. If result.isSdf: use result.material (skip material pipeline)
      Else: generate/apply material via Material Pipeline
   d. Generate/apply textures (skip for SDF)
   e. Generate LOD variants (skip for SDF — SDF adjusts iteration count by distance)
   f. Skip collision shapes (reserved for future — no physics engine in scope)
   g. Set up animations
4. Build instance buffers for prefab instances
5. Compose scene graph (parent-child transforms, children in parent-local space)
6. Set up camera, lights, environment
7. Render via WebGPURenderer
```

#### Scene Component

`src/pipeline/renderer/SceneFromYaml.tsx`

A React component that takes a scene YAML path and renders it:

```tsx
export default function SceneFromYaml({ scenePath }: { scenePath: string }) {
  const scene = useSceneLoader(scenePath);
  // ... renders all objects with appropriate generators/materials
}
```

#### Demo Integration

Each scene-based demo is minimal:

```tsx
// src/demos/junkyard/index.tsx
import SceneFromYaml from '../../pipeline/renderer/SceneFromYaml';

export default function Junkyard() {
  return <SceneFromYaml scenePath="/scenes/junkyard.scene.yaml" />;
}
```

The scene YAML is the source of truth. The demo component is just a thin wrapper.

### Sub-Project 5: Prefab & Instancing System

**Depends on:** Scene Spec, Geometry Generators
**Parallel with:** Material Pipeline, LOD, Asset Optimizer

`src/pipeline/prefabs/`

#### Prefab Registry

```typescript
interface Prefab {
  id: string;
  prompt: string;
  style: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  lod?: LodLevels;
  collision?: THREE.BufferGeometry;
}

class PrefabRegistry {
  register(id: string, prefab: Prefab): void;
  get(id: string): Prefab | undefined;
  instantiate(id: string, transforms: Transform[]): THREE.InstancedMesh;
}
```

#### Prefab Sources

1. **Inline in scene** — `register_prefab: true` on an object registers it after generation
2. **Prefab library** — `prefabs:` section in scene YAML defines reusable templates
3. **Cross-scene** — prefabs stored in `public/prefabs/<id>/` (geometry + material + metadata)

#### GPU Instancing

When an object has `instances: [...]`, the renderer:
1. Generates the mesh once
2. Creates an `InstancedMesh` with N instances
3. Sets per-instance matrices from the transform list
4. Optionally supports per-instance color/material variation via instance attributes

This uses the proven instanced mesh pattern from Batch 1 demos.

### Sub-Project 6: LOD System

**Depends on:** Geometry Generators
**Parallel with:** Everything else

`src/pipeline/lod/`

#### LOD Generation

When an object has `lod: auto`:
1. **High detail** — original generated geometry (0-30 units from camera)
2. **Medium detail** — simplified to ~50% faces (30-80 units)
3. **Low detail** — simplified to ~20% faces (80+ units)

Simplification via vertex merging and edge collapse (using a mesh simplification library or custom implementation).

#### LOD in Scene Spec

```yaml
lod: auto                    # auto-generate 3 levels
# OR
lod:
  levels:
    - distance: 0
      detail: 1.0
    - distance: 30
      detail: 0.5
    - distance: 80
      detail: 0.2
```

#### LOD Rendering

Uses Three.js `LOD` object — adds each detail level as a child, Three.js handles distance-based switching automatically.

**LOD + Instancing interaction:** Three.js `LOD` does not work natively with `InstancedMesh`. For instanced objects, LOD is skipped in Phase 3 — all instances use the same detail level. A future optimization could partition instances by camera distance into separate `InstancedMesh` per LOD tier, but this is not in scope for the initial implementation.

SDF objects don't need mesh LOD — they can adjust iteration count or simplify the SDF function based on distance.

### Sub-Project 7: Asset Optimization Pipeline

**Depends on:** Geometry Generators, Prefab System
**Parallel with:** Material Pipeline, Scene Renderer

`src/pipeline/optimizer/`

Post-processing pipeline that optimizes generated assets for production.

#### Optimization Steps

1. **Mesh cleanup** — remove degenerate triangles, merge duplicate vertices
2. **Mesh simplification** — reduce poly count for LOD levels (shared with LOD system)
3. **Material deduplication** — identical materials share one instance
4. **Geometry deduplication** — identical meshes share one BufferGeometry
5. **Texture compression** — resize oversized textures, compress to appropriate format
6. **Instance detection** — auto-detect repeated objects and convert to InstancedMesh

#### Optimization Config

```json
// .model-optimization.config.json
{
  "maxVerticesPerObject": 50000,
  "maxTextureResolution": 2048,
  "lodLevels": 3,
  "autoInstance": true,
  "deduplication": true
}
```

## File Structure

```
src/
  pipeline/
    spec/
      schema.ts             # TypeScript types for scene YAML
      parser.ts             # YAML parser + validator
      defaults.ts           # default values for optional fields
    generators/
      index.ts              # generator registry + selection logic
      csg.ts                # Tier 1: CSG boolean operations
      sdf.ts                # Tier 3: SDF raymarching
      sdf-lib.ts            # SDF primitive library (TSL functions)
      codegen.ts            # Tier 4: AI code gen loader
      tripo.ts              # Tier 5: Tripo3D API adapter (stub)
      parametric/
        index.ts            # parametric generator registry
        vehicle.ts
        character.ts
        vegetation.ts
        terrain.ts
        rock.ts
        building.ts
        furniture.ts
        debris.ts
        weapon.ts
        organic.ts
    materials/
      index.ts              # material resolver (prompt → material)
      presets/
        index.ts            # preset registry
        rusted-metal.ts
        concrete.ts
        glass.ts
        wood.ts
        fabric.ts
        chrome.ts
        organic.ts
        neon.ts
        cel-shaded.ts
        # ... more presets
      shader-compiler.ts    # inline TSL → MeshStandardNodeMaterial
    textures/
      index.ts              # texture resolver
      procedural.ts         # TSL procedural texture generators
      ai-generator.ts       # AI texture API adapter (stub)
    prefabs/
      registry.ts           # prefab registry + instancing
    lod/
      generator.ts          # LOD level generation
      simplifier.ts         # mesh simplification
    optimizer/
      index.ts              # optimization pipeline orchestrator
      mesh-cleanup.ts
      deduplication.ts
      texture-compress.ts
    renderer/
      SceneFromYaml.tsx     # main React component
      scene-loader.ts       # YAML loading + caching
      object-renderer.tsx   # per-object component
      environment.tsx       # fog, lights, background
      animation.ts          # animation system
  scenes/                   # scene YAML files (source of truth)
    junkyard.scene.yaml
    alien-garden.scene.yaml
    # ... more scenes
```

## Implementation Order & Parallelism

```
Phase 1 (all parallel):
├── SP1: Scene Spec (types, parser, validator)
├── SP3: Material presets (first 5-6 core presets)
└── SP2a: CSG generator
    SP2b: Parametric generators (start with terrain + rock + vegetation)
    SP2c: SDF generator + primitives library

Phase 2 (after Phase 1 types exist):
├── SP4: Scene Renderer (SceneFromYaml component)
├── SP5: Prefab registry + instancing
└── SP2d: More parametric generators (vehicle, character, debris)
    SP2e: AI code gen loader

Phase 3 (after renderer works):
├── SP6: LOD system
├── SP7: Asset optimizer
├── SP3b: More material presets
└── First scene-based demos

Phase 4 (future):
├── AI texture generation (when API available)
├── Tripo3D integration (when funded)
└── Spec extraction + documentation for other projects
```

Phase 1 sub-projects are fully independent — 5+ parallel work streams.
Phase 2 depends on Phase 1 types but sub-projects are independent of each other.
Phase 3 depends on a working renderer but sub-projects are independent.

## Demo Strategy

New demos will use the scene pipeline:

- Each demo is a scene YAML + thin wrapper component
- Demo overlay shows the `technique` from scene metadata
- Existing 35 demos remain unchanged (they showcase WebGPU capabilities)
- New demos showcase the model pipeline

**Example demo subjects:**
- "Abandoned Junkyard" — parametric vehicles, CSG barriers, procedural terrain
- "Alien Garden" — SDF organic shapes, parametric vegetation, custom TSL materials
- "Medieval Forge" — CSG/codegen tools, parametric building, fire SDF
- "Cel-Shaded Battle" — parametric characters, stylized materials, weapon generators
- "Underwater Ruins" — parametric rocks/building, SDF corals, water materials

## Success Criteria

1. A scene YAML with 5+ objects renders correctly via `SceneFromYaml`
2. All 4 geometry tiers produce visible, textured objects
3. Material presets cover the 15 most common surface types
4. Prefabs with GPU instancing work (100+ instances at 60fps)
5. LOD reduces draw calls by 50%+ in scenes with distant objects
6. Ralph can create a new scene from a text prompt by writing a scene YAML
7. The scene spec YAML schema is documented and portable to other projects
8. A follow-up prompt ("make the car more rusted") modifies the existing YAML correctly

## Tripo3D Integration (Future)

When Tripo3D is funded:
- API adapter sends prompt, receives .glb
- GLTFLoader imports into Three.js scene
- Auto-cached in `public/models/<cache-key>/`
- Falls back to Tier 4 if API is down
- Scene spec: `generator: tripo`

The pipeline is designed so Tripo3D is a drop-in generator — no architecture changes needed.
