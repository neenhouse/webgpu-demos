# Material & Texture Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the material resolver (preset -> pbr -> prompt -> shader resolution), 8 core PBR presets, inline TSL shader compiler, and procedural texture generators.

**Architecture:** Material resolver takes a MaterialDef from the scene spec and returns a configured MeshStandardNodeMaterial. Presets are factory functions. The shader compiler evaluates inline TSL code. Procedural textures use TSL nodes for noise/pattern generation.

**Tech Stack:** TypeScript, Three.js r183, TSL (three/tsl), MeshStandardNodeMaterial

---

## Context & References

| Document | Path | Purpose |
|----------|------|---------|
| Full spec | `docs/superpowers/specs/2026-03-24-model-pipeline-design.md` | Sub-Project 3 defines material/texture schemas and resolution order |
| Learnings | `docs/ralph-specs/learnings.md` | Proven TSL patterns from 35 demos (hash noise, fresnel, Fn(), mix/smoothstep, etc.) |
| TSL Torus demo | `src/demos/tsl-torus/index.tsx` | Minimal MeshStandardNodeMaterial with colorNode, emissiveNode, positionNode |
| Noise Dissolve demo | `src/demos/noise-dissolve/index.tsx` | Hash noise, smoothstep, alphaTest, mix for multi-stop color gradients |
| Flame Orb demo | `src/demos/flame-orb/index.tsx` | Fn() for displacement, chained mix for color gradients, emissive self-lit |
| Crystal Grid demo | `src/demos/crystal-grid/index.tsx` | oscSine, fresnel, metalnessNode/roughnessNode as float nodes |

## Key TSL Patterns (Proven in This Codebase)

These patterns are validated across 35 demos and MUST be used in preset implementations:

1. **Material construction**: `new THREE.MeshStandardNodeMaterial()` with node assignments (`colorNode`, `emissiveNode`, `roughnessNode`, `metalnessNode`, `positionNode`, `opacityNode`)
2. **Imports**: `import * as THREE from 'three/webgpu'` and `import { color, time, float, mix, ... } from 'three/tsl'`
3. **Fresnel**: Wrap in `Fn(() => { ... })` and call with `fresnel()` -- computes `1 - dot(normal, viewDir)^power`
4. **Hash noise**: `hash(positionLocal.mul(N))` for pseudo-random values; blend octaves for variety
5. **Color gradients**: Chained `mix(a, b, smoothstep(lo, hi, value))` for multi-stop gradients
6. **Transparency**: `mat.transparent = true; mat.alphaTest = 0.5; mat.opacityNode = ...` (never use `If()`/`Discard()` in material context)
7. **Side/blending**: `mat.side = THREE.DoubleSide`, `mat.blending = THREE.AdditiveBlending` as needed
8. **Float nodes for PBR**: `mat.roughnessNode = float(0.3)` and `mat.metalnessNode = float(0.8)` for node-level PBR
9. **Avoid**: `If()`/`Discard()` outside compute Fn, `PointsNodeMaterial`, `mat.opacityNode` read-back, `.atan2()` method

## File Structure

```
src/pipeline/materials/
  index.ts                    # Public API: resolveMaterial(materialDef, context) -> MeshStandardNodeMaterial
  resolver.ts                 # Resolution order logic (inherit -> preset -> pbr -> prompt -> shader -> overrides)
  shader-compiler.ts          # Inline TSL code string -> material node assignment
  types.ts                    # MaterialDef, MaterialContext, PresetFactory types
  presets/
    index.ts                  # Preset registry: register(), get(), list()
    rusted-metal.ts           # Rusted metal preset
    concrete.ts               # Weathered concrete preset
    glass.ts                  # Clear + frosted glass preset
    wood.ts                   # Oak wood preset
    chrome.ts                 # Chrome/mirror preset
    organic.ts                # Organic skin/flesh preset
    neon.ts                   # Neon glow preset
    cel-shaded.ts             # Cel-shaded/toon preset
src/pipeline/textures/
  index.ts                    # Public API: resolveTextures(textureDef, material)
  procedural.ts               # Procedural texture generators (noise, patterns)
  types.ts                    # TextureDef types
```

## Types Overview

Before implementation, define these types (derived from the spec's YAML schema):

```typescript
// src/pipeline/materials/types.ts

interface MaterialDef {
  prompt?: string;
  preset?: string;
  pbr?: {
    color?: string;
    roughness?: number;    // 0-1, clamped
    metalness?: number;    // 0-1, clamped
    opacity?: number;      // 0-1, clamped
    emissive?: string;
    emissive_intensity?: number;
  };
  shader?: string;           // inline TSL code block
  inherit?: 'parent' | string;
  overrides?: Record<string, unknown>;
  side?: 'front' | 'back' | 'double';
  transparent?: boolean;
  blending?: 'normal' | 'additive';
  wireframe?: boolean;
  flatShading?: boolean;
}

interface MaterialContext {
  parentMaterial?: MeshStandardNodeMaterial;
  sceneObjects?: Map<string, { material?: MaterialDef }>;
  objectId?: string;
}

type PresetFactory = (overrides?: MaterialDef['pbr']) => MeshStandardNodeMaterial;
```

---

## Tasks

### Task 1: Create types and material resolver skeleton

**Files:** `src/pipeline/materials/types.ts`, `src/pipeline/materials/index.ts`, `src/pipeline/materials/resolver.ts`

- [ ] Create `src/pipeline/materials/types.ts` with `MaterialDef`, `MaterialContext`, and `PresetFactory` interfaces as shown in the Types Overview above. Include JSDoc comments explaining each field. Clamp ranges (roughness, metalness, opacity to 0-1) should be documented as comments -- actual clamping happens in the resolver.
- [ ] Create `src/pipeline/materials/resolver.ts` with the `resolveMaterial(def: MaterialDef, context?: MaterialContext): MeshStandardNodeMaterial` function. For now, implement only the skeleton:
  - Create a new `MeshStandardNodeMaterial`
  - Apply `side`, `transparent`, `blending`, `wireframe`, `flatShading` rendering hints from the def
  - Apply `pbr` values if present (color via `mat.color.set()`, roughness/metalness as direct properties, emissive via `mat.emissive.set()`, opacity)
  - Clamp PBR values to valid ranges: `Math.max(0, Math.min(1, value))` for roughness, metalness, opacity
  - Map `side` string to THREE constant: 'front' -> `THREE.FrontSide`, 'back' -> `THREE.BackSide`, 'double' -> `THREE.DoubleSide`
  - Map `blending` string: 'additive' -> `THREE.AdditiveBlending`, default -> `THREE.NormalBlending`
  - Log a console warning and return default grey material if an unknown preset is requested (per spec error handling)
  - Leave `inherit`, `preset`, `prompt`, and `shader` steps as TODO comments with the resolution order documented
- [ ] Create `src/pipeline/materials/index.ts` that re-exports `resolveMaterial` from resolver and re-exports types

**Acceptance criteria:** Calling `resolveMaterial({ pbr: { color: '#ff0000', roughness: 0.5, metalness: 0.8 } })` returns a correctly configured `MeshStandardNodeMaterial`. Values outside 0-1 are clamped. Unknown preset names produce a console warning and grey fallback material.

**Commit message:** `feat(materials): add material resolver skeleton with types and PBR application`

---

### Task 2: Implement resolution order logic

**Files:** `src/pipeline/materials/resolver.ts`

- [ ] Implement the full resolution order in `resolveMaterial()` as specified in the spec (Section "Material Resolution Order"):
  1. **inherit** -- if `def.inherit` is set, look up the referenced material. If `'parent'`, use `context.parentMaterial`. If a string ID, look up from `context.sceneObjects`. Clone the material via `material.clone()`. If the referenced material is not found, log a warning and continue with a fresh material.
  2. **preset** -- if `def.preset` is set, call `getPreset(def.preset)` from the preset registry. If not found, log warning and use default grey material (per spec).
  3. **pbr** -- apply structured PBR overrides on top of whatever base material exists from steps 1-2. Use node assignments for PBR properties: `mat.colorNode = color(hexValue)` when a color is provided, `mat.roughnessNode = float(clampedValue)`, `mat.metalnessNode = float(clampedValue)`. This ensures PBR values work alongside TSL node graphs from presets.
  4. **prompt** -- leave as a no-op with a `// TODO: AI prompt interpretation` comment. This will be implemented when the AI integration layer is built.
  5. **shader** -- if `def.shader` is set, call `compileShader(def.shader, material)` from the shader compiler. Import from `./shader-compiler`. For now, the shader compiler can be a stub that logs a warning.
  6. **overrides** -- apply `def.overrides` last. Iterate over the overrides record and apply known PBR keys (color, roughness, metalness, opacity, emissive, emissive_intensity) the same way as step 3.
- [ ] Add a helper function `applyPbrOverrides(mat: MeshStandardNodeMaterial, pbr: MaterialDef['pbr']): void` that encapsulates the PBR application logic (shared between steps 3 and 6).
- [ ] Ensure the function handles the case where no fields are set at all -- returns a default `MeshStandardNodeMaterial` with no node overrides (standard grey).

**Acceptance criteria:** A MaterialDef with `{ preset: 'chrome', pbr: { roughness: 0.3 } }` first loads the chrome preset, then overrides its roughness to 0.3. A MaterialDef with `{ inherit: 'parent' }` clones the parent material from context. Resolution steps are applied in the documented order.

**Commit message:** `feat(materials): implement full resolution order (inherit -> preset -> pbr -> prompt -> shader -> overrides)`

---

### Task 3: Create preset registry

**Files:** `src/pipeline/materials/presets/index.ts`

- [ ] Create a preset registry with the following API:
  ```typescript
  const presetRegistry = new Map<string, PresetFactory>();

  export function registerPreset(name: string, factory: PresetFactory): void;
  export function getPreset(name: string): PresetFactory | undefined;
  export function listPresets(): string[];
  ```
- [ ] The registry should be populated at module load time by importing all preset modules. Each preset module calls `registerPreset()` as a side effect of being imported.
- [ ] Add a `loadAllPresets()` function that imports all preset modules (ensures side effects run). Call this from the registry module's top-level scope.
- [ ] Export the public API: `registerPreset`, `getPreset`, `listPresets`.

**Implementation detail:** Use a simple `Map<string, PresetFactory>` rather than dynamic imports. Since presets are small factory functions (no heavy assets), eager loading is fine and avoids async complexity.

**Acceptance criteria:** `getPreset('chrome')` returns a factory function. `listPresets()` returns all registered preset names. `getPreset('nonexistent')` returns `undefined`.

**Commit message:** `feat(materials): add preset registry with register/get/list API`

---

### Task 4: Implement first 4 presets -- rusted-metal, concrete-weathered, chrome, wood-oak

**Files:** `src/pipeline/materials/presets/rusted-metal.ts`, `src/pipeline/materials/presets/concrete.ts`, `src/pipeline/materials/presets/chrome.ts`, `src/pipeline/materials/presets/wood.ts`

Each preset is a factory function that returns a `MeshStandardNodeMaterial` with TSL nodes configured. Each accepts optional `pbr` overrides that are applied after the preset defaults.

#### 4a: rusted-metal.ts
- [ ] Create `rusted-metal` preset factory:
  - Base color: orange-brown (`#8B4513`) with hash noise variation -- blend between rust orange (`#CC6633`) and dark brown (`#3D1C02`) using `hash(positionLocal.mul(15))` as blend factor
  - `roughnessNode`: High, varying 0.7-0.95 via `float(0.7).add(hash(positionLocal.mul(25)).mul(0.25))`
  - `metalnessNode`: Medium, varying 0.3-0.6 via similar hash pattern at different frequency
  - `emissiveNode`: None (no self-illumination)
  - Register as both `'rusted-metal'` and `'rust'` (alias)
  - Apply any pbr overrides passed to the factory

#### 4b: concrete.ts
- [ ] Create `concrete-weathered` preset factory:
  - Base color: grey (`#888888`) with dirt variation -- blend towards dark grey-brown (`#554433`) using multi-octave hash noise
  - `roughnessNode`: High, 0.85-0.98 via hash noise
  - `metalnessNode`: Near zero, `float(0.02)`
  - Subtle position displacement along normals using low-amplitude hash noise for surface roughness feel: `positionLocal.add(normalLocal.mul(hash(positionLocal.mul(30)).mul(0.005)))` via `positionNode`
  - Register as both `'concrete-weathered'` and `'concrete'`

#### 4c: chrome.ts
- [ ] Create `chrome` preset factory:
  - Base color: near-white (`#f0f0f0`) for maximum reflectivity
  - `roughnessNode`: Very low, `float(0.05)` for mirror-like reflection
  - `metalnessNode`: Full, `float(1.0)`
  - Fresnel-based emissive for environment reflection simulation: `color(0xaaccff).mul(fresnel()).mul(0.5)` -- subtle blue-white rim glow simulating sky reflection
  - The fresnel helper should use the proven `Fn()` pattern from the codebase: `Fn(() => { const viewDir = cameraPosition.sub(positionWorld).normalize(); const nDotV = normalWorld.dot(viewDir).saturate(); return float(1.0).sub(nDotV).pow(2.0); })()`
  - Register as both `'chrome'` and `'mirror'`

#### 4d: wood.ts
- [ ] Create `wood-oak` preset factory:
  - Base color: warm brown tones -- use `positionLocal.y` (or a mix of axes) run through `sin()` at varying frequencies to create wood grain banding. Blend between light oak (`#D4A574`) and dark grain (`#8B5E3C`) using `sin(positionLocal.x.mul(2).add(positionLocal.y.mul(20)).add(positionLocal.z.mul(2))).mul(0.5).add(0.5)` with `smoothstep` for sharper grain lines
  - `roughnessNode`: Medium, `float(0.55)` -- polished wood feel
  - `metalnessNode`: Zero, `float(0.0)`
  - No emissive
  - Register as both `'wood-oak'` and `'wood'`

**Implementation pattern for all presets:**
```typescript
import { registerPreset } from './index';
import * as THREE from 'three/webgpu';
import { color, float, hash, positionLocal, mix, ... } from 'three/tsl';
import type { PresetFactory } from '../types';

const factory: PresetFactory = (overrides) => {
  const mat = new THREE.MeshStandardNodeMaterial();
  // ... TSL node assignments ...
  // Apply overrides if provided
  if (overrides?.roughness !== undefined) mat.roughnessNode = float(Math.max(0, Math.min(1, overrides.roughness)));
  // ... etc for each overridable property
  return mat;
};

registerPreset('preset-name', factory);
registerPreset('alias', factory);

export default factory;
```

**Acceptance criteria:** Each preset factory returns a `MeshStandardNodeMaterial` with TSL nodes that produce visually distinct surfaces. `getPreset('chrome')()` returns a high-metalness mirror material. `getPreset('rust')()` returns a rough orange-brown material. Overrides work: `getPreset('chrome')({ roughness: 0.5 })` produces a less reflective chrome.

**Commit message:** `feat(materials): implement rusted-metal, concrete, chrome, and wood-oak presets`

---

### Task 5: Implement next 4 presets -- glass-clear, organic, neon-glow, cel-shaded

**Files:** `src/pipeline/materials/presets/glass.ts`, `src/pipeline/materials/presets/organic.ts`, `src/pipeline/materials/presets/neon.ts`, `src/pipeline/materials/presets/cel-shaded.ts`

#### 5a: glass.ts
- [ ] Create `glass-clear` preset factory:
  - `mat.transparent = true`
  - `mat.opacity = 0.15` (mostly see-through)
  - Base color: very light blue tint (`#e8f4f8`)
  - `roughnessNode`: Very low, `float(0.05)`
  - `metalnessNode`: Low, `float(0.1)`
  - Strong fresnel rim: objects appear more opaque at glancing angles. Set `opacityNode` to a fresnel-based value: `float(0.1).add(fresnel().mul(0.6))` so edges are more visible than face-on surfaces
  - `mat.side = THREE.DoubleSide` (see through to back faces)
  - Register as `'glass-clear'` and `'glass'`
- [ ] Create `glass-frosted` variant in the same file:
  - Same as clear but `roughnessNode = float(0.45)` and higher base opacity (`0.3`)
  - Register as `'glass-frosted'`

#### 5b: organic.ts
- [ ] Create `organic` (skin/flesh) preset factory:
  - Base color: flesh tones -- blend between pale (`#FFCBA4`) and reddish (`#CC7755`) using multi-octave hash noise for skin-like variation
  - `roughnessNode`: Medium, `float(0.55)`
  - `metalnessNode`: Zero, `float(0.0)`
  - Subtle subsurface scattering hint via emissive: `color(0xff4422).mul(fresnel().oneMinus().mul(0.15))` -- warm red glow on face-on surfaces (opposite of fresnel rim, simulating light passing through thin skin)
  - Slight vertex displacement for organic surface irregularity
  - Register as `'organic'`, `'skin-organic'`, and `'skin'`

#### 5c: neon.ts
- [ ] Create `neon-glow` preset factory:
  - This preset is emissive-driven -- the object glows
  - Accept a color override (default: cyan `#00ffcc`)
  - `colorNode`: The provided color (or default cyan)
  - `emissiveNode`: Strong glow -- `color(neonColor).mul(float(2.5))` modulated by a gentle pulse: `.mul(oscSine(time.mul(1.5)).mul(0.3).add(0.85))` for breathing effect
  - Fresnel rim to intensify edges: add `color(neonColor).mul(fresnel().mul(1.5))` to the emissive
  - `roughnessNode`: Low, `float(0.2)`
  - `metalnessNode`: Low, `float(0.1)`
  - Register as `'neon-glow'` and `'neon'`

#### 5d: cel-shaded.ts
- [ ] Create `cel-shaded` preset factory:
  - `mat.flatShading = true` for hard polygon edges
  - Quantized lighting simulation: use `normalWorld.dot(vec3(0.5, 1, 0.3).normalize())` as a light factor, then `smoothstep` into 3-4 discrete bands for toon shading:
    ```
    band = smoothstep(0.0, 0.05, lightFactor).mul(0.33)
      .add(smoothstep(0.3, 0.35, lightFactor).mul(0.33))
      .add(smoothstep(0.6, 0.65, lightFactor).mul(0.34))
    ```
  - Apply banding to colorNode: `mix(shadowColor, baseColor, band)` where shadowColor is a darkened version of the base
  - `roughnessNode`: High, `float(0.9)` to minimize specular
  - `metalnessNode`: Zero, `float(0.0)`
  - No emissive (cel shading relies on diffuse only)
  - Register as `'cel-shaded'` and `'toon'`

**Acceptance criteria:** Glass preset produces transparent material with fresnel-driven opacity. Neon preset glows with pulsing emissive. Cel-shaded preset shows discrete lighting bands with flat shading. Organic preset has warm subsurface tint.

**Commit message:** `feat(materials): implement glass, organic, neon-glow, and cel-shaded presets`

---

### Task 6: Implement inline TSL shader compiler

**Files:** `src/pipeline/materials/shader-compiler.ts`

- [ ] Create `compileShader(shaderCode: string, mat: MeshStandardNodeMaterial): void` function that takes an inline TSL code string from the scene YAML `material.shader` field and applies it to the material.

**Approach:** The shader string from the YAML contains TSL expressions that reference `mat` (the material being configured) and standard TSL imports. The compiler:

1. **Parse** the shader string to identify which material nodes are being assigned (look for `mat.colorNode =`, `mat.emissiveNode =`, `mat.positionNode =`, `mat.opacityNode =`, `mat.roughnessNode =`, `mat.metalnessNode =`).
2. **Build** a factory function using `new Function()` that receives the TSL utility functions and mat as arguments and executes the shader code.
3. **Execute** the factory in a sandboxed scope with the TSL imports provided as arguments.

- [ ] Implement the function with this structure:
  ```typescript
  export function compileShader(shaderCode: string, mat: MeshStandardNodeMaterial): void {
    // Create a mapping of available TSL functions
    const tslScope = {
      color, float, vec3, vec4, mix, smoothstep, hash,
      positionLocal, positionWorld, normalLocal, normalWorld,
      cameraPosition, time, oscSine, uv, Fn,
      screenUV, screenSize, atan, length, abs, fract, sin, cos,
      // ... all commonly used TSL imports
    };

    // Build argument names and values arrays
    const argNames = ['mat', ...Object.keys(tslScope)];
    const argValues = [mat, ...Object.values(tslScope)];

    try {
      const fn = new Function(...argNames, shaderCode);
      fn(...argValues);
    } catch (err) {
      console.error('[shader-compiler] Failed to compile inline TSL shader:', err);
      console.error('[shader-compiler] Shader code:', shaderCode);
      // Material remains in its pre-shader state (preset/pbr values still apply)
    }
  }
  ```

- [ ] Document clearly that inline shaders are **not sandboxed** -- they run arbitrary JavaScript. This is acceptable because scene YAML files are authored by Ralph (trusted AI) or the developer, not user-supplied. Add a comment noting this.

- [ ] Handle edge cases:
  - Empty shader string: no-op, return immediately
  - Shader that throws: catch error, log it, leave material in pre-shader state
  - Shader that references unavailable TSL functions: the `new Function` scope only provides what we pass in; undefined references will throw and be caught

**Acceptance criteria:** A shader string like `mat.colorNode = mix(color(0x220044), color(0x00ffcc), oscSine(time));` correctly assigns the colorNode on the provided material. Errors in shader code are caught and logged without crashing.

**Commit message:** `feat(materials): implement inline TSL shader compiler`

---

### Task 7: Implement procedural texture generators

**Files:** `src/pipeline/textures/types.ts`, `src/pipeline/textures/index.ts`, `src/pipeline/textures/procedural.ts`

- [ ] Create `src/pipeline/textures/types.ts` with the `TextureDef` interface (from the spec):
  ```typescript
  interface TextureDef {
    prompt?: string;
    maps?: ('albedo' | 'normal' | 'roughness' | 'metalness' | 'ao' | 'emission' | 'displacement')[];
    resolution?: number;     // default 1024
    tiling?: [number, number]; // default [1, 1]
    source?: 'procedural' | 'ai-generated' | 'file';
    paths?: Record<string, string>;
  }
  ```

- [ ] Create `src/pipeline/textures/procedural.ts` with procedural texture generator functions. Each function returns a TSL node that can be assigned to a material property:

  **Noise generators:**
  - `hashNoise(scale?: number)`: Single-octave hash noise at given scale. Returns `hash(positionLocal.mul(scale))`.
  - `multiOctaveNoise(scales?: number[], weights?: number[])`: Blend multiple hash octaves. Default 3 octaves at scales [25, 67, 143] with weights [0.5, 0.3, 0.2] (proven pattern from noise-dissolve demo).
  - `fbmNoise(octaves?: number, lacunarity?: number, gain?: number)`: Attempt at fractional Brownian motion using layered hash. Each octave doubles frequency and halves amplitude.

  **Pattern generators:**
  - `checkerboard(scaleU?: number, scaleV?: number)`: Uses `uv()` with `floor()` and modulo for alternating black/white pattern. Returns a float node (0 or 1).
  - `stripes(axis?: 'u' | 'v', frequency?: number, sharpness?: number)`: Directional stripes using `sin(uv().component.mul(frequency))` with `smoothstep` for sharpness control.
  - `brick(columns?: number, rows?: number, mortarWidth?: number)`: Brick pattern using `uv()` with row offset for staggering. Returns float node (0 = mortar, 1 = brick).
  - `woodGrain(frequency?: number, ringTightness?: number)`: Concentric ring pattern using distance from a local axis, modulated by sin for ring banding. Based on the wood preset pattern but generalized.

  **Weathering generators:**
  - `rustPatches(density?: number, roughnessVar?: number)`: Combines hash noise at multiple frequencies to create patches of high roughness / color variation.
  - `dirtAccumulation(amount?: number)`: Uses `positionLocal.y` (gravity-based) combined with noise to darken lower and concave areas.

- [ ] Create `src/pipeline/textures/index.ts` with `resolveTextures(def: TextureDef, mat: MeshStandardNodeMaterial): void`:
  - If `source === 'procedural'` or source is undefined:
    - For now, apply procedural noise to the material's roughness variation and subtle color variation
    - Future: parse the `prompt` to select appropriate procedural generators
  - If `source === 'file'`: log a TODO (file-based textures are a future feature)
  - If `source === 'ai-generated'`: log a TODO (AI textures are Phase 2)
  - Apply `tiling` by multiplying UV coordinates: `uv().mul(vec2(tiling[0], tiling[1]))`

**Acceptance criteria:** `checkerboard()` returns a TSL node that produces alternating 0/1 values. `multiOctaveNoise()` returns blended hash noise. `resolveTextures()` can apply procedural roughness variation to a material. All generators are pure functions returning TSL nodes (no side effects).

**Commit message:** `feat(textures): implement procedural texture generators (noise, patterns, weathering)`

---

### Task 8: Implement material inheritance resolution

**Files:** `src/pipeline/materials/resolver.ts`

- [ ] Flesh out the inheritance step in `resolveMaterial()`:
  - When `def.inherit === 'parent'`:
    - Verify `context.parentMaterial` exists. If not, log `[material-resolver] inherit: "parent" but no parent material in context for object "${context?.objectId}"` and skip inheritance.
    - Clone the parent material: `const mat = context.parentMaterial.clone()`. Note: `MeshStandardNodeMaterial.clone()` copies node references (shallow clone of node graph). This is correct -- inherited children share the same node graph unless they override specific nodes.
  - When `def.inherit` is a string (object ID reference):
    - Look up the object in `context.sceneObjects` by the inherit string value
    - If found and it has a resolved material, clone it
    - If not found, log warning with the ID and skip inheritance
  - After cloning, the remaining resolution steps (preset, pbr, shader, overrides) apply on top of the cloned material, allowing children to selectively override inherited properties.

- [ ] Add integration between inheritance and overrides:
  - When `def.overrides` is present alongside `def.inherit`, the overrides represent the delta from the inherited material
  - The `applyPbrOverrides` function from Task 2 handles this -- overrides are applied as the last step regardless

- [ ] Handle the edge case from the spec: "Shader is atomic -- you cannot inherit a shader and override individual lines. If a child needs a slightly different shader, it must provide a complete new shader block." Ensure that if a child provides `def.shader`, it replaces all node assignments from the inherited material's shader (the compileShader function already does this by directly assigning nodes).

**Acceptance criteria:** An object with `material: { inherit: "parent", overrides: { roughness: 0.9 } }` clones its parent's material and only changes roughness. An object with `material: { inherit: "wall-base" }` looks up "wall-base" in the scene objects map. Missing inherit targets produce console warnings without crashing.

**Commit message:** `feat(materials): implement material inheritance with clone and override support`

---

### Task 9: Tests for resolver, presets, and shader compiler

**Files:** `src/pipeline/materials/__tests__/resolver.test.ts`, `src/pipeline/materials/__tests__/presets.test.ts`, `src/pipeline/materials/__tests__/shader-compiler.test.ts`, `src/pipeline/textures/__tests__/procedural.test.ts`

> **Note:** These tests validate the TypeScript logic (factory function calls, registry lookups, override application, error handling). They do NOT render anything -- no WebGPU context is needed. TSL node construction works without a GPU; nodes are just JavaScript objects describing the shader graph.

#### 9a: resolver.test.ts
- [ ] Test: `resolveMaterial` with empty def returns a default MeshStandardNodeMaterial
- [ ] Test: `resolveMaterial` with pbr values applies color, roughness, metalness correctly
- [ ] Test: PBR values are clamped -- roughness of 1.5 becomes 1.0, metalness of -0.3 becomes 0.0
- [ ] Test: `resolveMaterial` with unknown preset logs a console warning (spy on console.warn) and returns a material
- [ ] Test: `resolveMaterial` with `inherit: 'parent'` and valid context clones the parent material
- [ ] Test: `resolveMaterial` with `inherit: 'parent'` but no parent in context logs a warning and still returns a material
- [ ] Test: Resolution order -- preset is applied before pbr overrides
- [ ] Test: `side`, `transparent`, `blending`, `wireframe`, `flatShading` rendering hints are applied

#### 9b: presets.test.ts
- [ ] Test: All 8 presets are registered and retrievable via `getPreset()`
- [ ] Test: Each preset factory returns a MeshStandardNodeMaterial instance
- [ ] Test: `listPresets()` returns all expected preset names (including aliases)
- [ ] Test: Preset aliases work -- `getPreset('rust')` returns the same factory as `getPreset('rusted-metal')`
- [ ] Test: Preset with pbr overrides applies the override (e.g., chrome with roughness 0.5)
- [ ] Test: Glass preset sets `transparent = true` and `side = DoubleSide`
- [ ] Test: Cel-shaded preset sets `flatShading = true`
- [ ] Test: Neon preset has an emissiveNode assigned (not null)

#### 9c: shader-compiler.test.ts
- [ ] Test: `compileShader` with valid code assigns colorNode to the material
- [ ] Test: `compileShader` with empty string is a no-op
- [ ] Test: `compileShader` with invalid code catches error and logs it (spy on console.error)
- [ ] Test: `compileShader` with code referencing `mat.roughnessNode = float(0.5)` sets roughnessNode
- [ ] Test: Material retains pre-shader state when shader compilation fails

#### 9d: procedural.test.ts
- [ ] Test: `hashNoise()` returns a node (not null/undefined)
- [ ] Test: `multiOctaveNoise()` with default params returns a node
- [ ] Test: `checkerboard()` returns a node
- [ ] Test: `brick()` returns a node
- [ ] Test: `stripes()` with axis parameter returns a node
- [ ] Test: `resolveTextures()` with source 'procedural' does not throw

**Test setup notes:**
- Import Three.js and TSL normally -- TSL node construction is pure JavaScript
- Mock `console.warn` and `console.error` with `vi.spyOn` for warning/error tests
- No need for canvas, WebGPU adapter, or rendering context
- Use Vitest (already in the project's test setup, or add if missing)

**Acceptance criteria:** All tests pass. Console warning/error spying correctly verifies error paths. Each preset is verified to exist and produce the right material type.

**Commit message:** `test(materials): add tests for resolver, presets, shader compiler, and procedural textures`

---

### Task 10: Final integration verification and commit

**Files:** `src/pipeline/materials/index.ts` (update exports if needed)

- [ ] Verify all files compile with `pnpm build` (no TypeScript errors)
- [ ] Verify all tests pass with `pnpm test` (or `pnpm vitest run`)
- [ ] Ensure `src/pipeline/materials/index.ts` exports the full public API:
  - `resolveMaterial` (the main entry point for the scene renderer)
  - `registerPreset`, `getPreset`, `listPresets` (for preset management)
  - `compileShader` (for direct shader compilation if needed)
  - All types: `MaterialDef`, `MaterialContext`, `PresetFactory`, `TextureDef`
- [ ] Ensure `src/pipeline/textures/index.ts` exports:
  - `resolveTextures` (main entry point)
  - All procedural generators (for direct use by presets or demos)
- [ ] Review that error handling matches the spec:
  - Unknown preset -> console warning + grey fallback
  - Invalid PBR values -> clamped to [0, 1]
  - Failed shader compilation -> caught, logged, material continues in pre-shader state
  - Missing inherit target -> console warning, continues without inheritance
- [ ] Verify no circular imports between materials/ and textures/ modules

**Acceptance criteria:** `pnpm build` succeeds. `pnpm test` passes. The material pipeline is ready for integration with the Scene Renderer (Sub-Project 4). No runtime errors when importing `src/pipeline/materials/index.ts`.

**Commit message:** `feat(materials): complete material & texture pipeline integration`

---

## Dependency Graph

```
Task 1 (types + skeleton)
  └──> Task 2 (resolution order)
  └──> Task 3 (preset registry)
         └──> Task 4 (first 4 presets)    [parallel with Task 6, 7]
         └──> Task 5 (next 4 presets)     [parallel with Task 6, 7]
  └──> Task 6 (shader compiler)           [parallel with Task 4, 5, 7]
  └──> Task 7 (procedural textures)       [parallel with Task 4, 5, 6]
  └──> Task 8 (inheritance)               [after Task 2]
  └──> Task 9 (tests)                     [after Tasks 2-8]
  └──> Task 10 (integration)              [after Task 9]
```

Tasks 4, 5, 6, and 7 are independent of each other and can be implemented in parallel after Tasks 1-3 are complete. Task 8 depends on Task 2. Tasks 9 and 10 are sequential at the end.

## Estimated Effort

| Task | Estimate | Notes |
|------|----------|-------|
| Task 1 | Small | Types + skeleton with PBR application |
| Task 2 | Medium | Full resolution chain with 6 steps |
| Task 3 | Small | Simple Map-based registry |
| Task 4 | Medium | 4 presets, each with TSL node graphs |
| Task 5 | Medium | 4 presets, glass/cel-shaded are more complex |
| Task 6 | Medium | new Function() sandboxing + TSL scope injection |
| Task 7 | Medium | Multiple procedural generators |
| Task 8 | Small | Clone + override logic |
| Task 9 | Medium | Comprehensive test suite |
| Task 10 | Small | Verification and cleanup |
