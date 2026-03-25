# Geometry Generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the generator interface and first 3 tiers: CSG (boolean ops), Parametric (terrain, rock, vegetation), and SDF (raymarched shapes with TSL primitive library).

**Architecture:** Common Generator interface with confidence-based selection. Each generator is a standalone module. CSG uses three-bvh-csg. Parametric generators produce BufferGeometry with UVs. SDF generator returns both geometry (bounding box) and material (raymarching shader).

**Tech Stack:** TypeScript, Three.js r183, three-bvh-csg, TSL (three/tsl), Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/pipeline/generators/types.ts` | GeneratorResult, Generator interface, SceneObject type stub |
| `src/pipeline/generators/index.ts` | Generator registry + confidence-based selection logic |
| `src/pipeline/generators/csg.ts` | CSG boolean operations generator |
| `src/pipeline/generators/sdf.ts` | SDF raymarching generator (returns geometry+material) |
| `src/pipeline/generators/sdf-lib.ts` | SDF primitive library (TSL functions) |
| `src/pipeline/generators/parametric/index.ts` | Parametric generator registry |
| `src/pipeline/generators/parametric/terrain.ts` | Terrain generator |
| `src/pipeline/generators/parametric/rock.ts` | Rock/boulder generator |
| `src/pipeline/generators/parametric/vegetation.ts` | Tree/bush generator |
| `src/pipeline/generators/__tests__/types.test.ts` | Tests for types & registry |
| `src/pipeline/generators/__tests__/csg.test.ts` | Tests for CSG generator |
| `src/pipeline/generators/__tests__/sdf.test.ts` | Tests for SDF generator |
| `src/pipeline/generators/__tests__/sdf-lib.test.ts` | Tests for SDF primitive library |
| `src/pipeline/generators/__tests__/parametric.test.ts` | Tests for parametric generators |

## Conventions

- Import Three.js as `import * as THREE from 'three/webgpu'`
- Import TSL functions from `'three/tsl'` (e.g., `import { Fn, float, vec3, length, ... } from 'three/tsl'`)
- Use `MeshStandardNodeMaterial` for standard materials, `MeshBasicNodeMaterial` for SDF raymarching
- All generator code is pure TypeScript (not React components) — generators produce Three.js objects consumed by the scene renderer
- Use `verbatimModuleSyntax` (TypeScript strict mode is on, `import type` required for type-only imports)
- Tests use Vitest with `vi.mock()` for Three.js mocking where needed

## Task Dependency Order

```
Task 1  (install three-bvh-csg + vitest)
  |
Task 2  (generator types)
  |
Task 3  (generator registry)
  |
  +---> Task 4  (CSG generator)
  |
  +---> Task 5  (SDF primitive library)
  |       |
  |     Task 6  (SDF generator)
  |
  +---> Task 7  (parametric terrain)
  +---> Task 8  (parametric rock)
  +---> Task 9  (parametric vegetation)
  |
Task 10 (tests for all generators)
```

Tasks 4, 5, 7, 8, 9 can run in parallel after Task 3. Task 6 depends on Task 5. Task 10 depends on all generators being complete.

---

### Task 1: Install three-bvh-csg and Vitest

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install three-bvh-csg**

```bash
pnpm add three-bvh-csg
```

- [ ] **Step 2: Validate three-bvh-csg compatibility with Three.js r183**

Check the installed version's peer dependency against `three@^0.183.2`. If it fails to install or has a peer dep conflict, investigate the error. The library must export `Brush`, `Evaluator`, and the operation constants (`ADDITION`, `SUBTRACTION`, `INTERSECTION`).

```bash
node -e "const csg = require('three-bvh-csg'); console.log(Object.keys(csg))"
```

If this fails because it's ESM-only, try:

```bash
node --input-type=module -e "import('three-bvh-csg').then(m => console.log(Object.keys(m)))"
```

Confirm the exports include: `Brush`, `Evaluator`, `ADDITION`, `SUBTRACTION`, `INTERSECTION`.

- [ ] **Step 3: Install Vitest**

```bash
pnpm add -D vitest
```

- [ ] **Step 4: Add test script to package.json**

Add to the `"scripts"` section:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add three-bvh-csg for CSG operations and vitest for testing"
```

---

### Task 2: Create Generator Types

**Files:**
- Create: `src/pipeline/generators/types.ts`

- [ ] **Step 1: Define the SceneObject type stub**

This is a minimal subset of the full scene spec (Sub-Project 1). It includes only what generators need. When the full scene spec types land (Sub-Project 1), this stub will be replaced with an import.

```typescript
// Minimal SceneObject stub for generators — will be replaced by full scene spec types
export interface SceneObject {
  id: string;
  prompt: string;
  style?: string;
  generator?: string;  // hint: 'csg' | 'parametric/terrain' | 'parametric/rock' | 'parametric/vegetation' | 'sdf' | ...
  params?: Record<string, unknown>;
  material?: {
    shader?: string;
    pbr?: Record<string, unknown>;
  };
}
```

- [ ] **Step 2: Define GeneratorResult**

Per the spec, the result includes geometry, optional material (for SDF), and metadata.

```typescript
import type * as THREE from 'three/webgpu';

export interface GeneratorMetadata {
  vertexCount: number;
  faceCount: number;
  generator: string;
  prompt: string;
  generationTime: number;  // milliseconds
}

export interface GeneratorResult {
  geometry: THREE.BufferGeometry;
  material?: THREE.Material;   // provided by SDF generator, skips material pipeline
  isSdf?: boolean;             // true = scene renderer skips material pipeline
  metadata: GeneratorMetadata;
}
```

- [ ] **Step 3: Define the Generator interface**

```typescript
export interface Generator {
  name: string;
  canHandle(object: SceneObject): number;  // confidence 0-1 (0 = can't handle, 1 = perfect match)
  generate(object: SceneObject): GeneratorResult;
}
```

- [ ] **Step 4: Define error marker helper type**

Per the spec, generator failures produce a magenta wireframe cube. Define a helper constant for this.

```typescript
/** Color used for error marker cubes when a generator fails */
export const ERROR_MARKER_COLOR = 0xff00ff;
```

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/generators/types.ts
git commit -m "feat: add Generator interface, GeneratorResult, and SceneObject stub types

Common types for the geometry generator pipeline. SceneObject is a
minimal stub that will be replaced when the full scene spec lands."
```

---

### Task 3: Create Generator Registry with Confidence-Based Selection

**Files:**
- Create: `src/pipeline/generators/index.ts`

- [ ] **Step 1: Implement the registry**

The registry holds all registered generators and selects the best one for a given SceneObject based on confidence scores. If a `generator` hint is provided in the scene object, prefer generators whose name matches. Otherwise, query all generators and pick the highest confidence.

```typescript
import type { Generator, GeneratorResult, SceneObject } from './types.ts';

const generators: Generator[] = [];

export function registerGenerator(generator: Generator): void {
  generators.push(generator);
}

export function getGenerators(): readonly Generator[] {
  return generators;
}
```

- [ ] **Step 2: Implement selectGenerator**

Selection logic:
1. If `object.generator` is set, find the generator whose `name` matches (exact or prefix match for `parametric/terrain` etc.). If found and its `canHandle() > 0`, use it.
2. Otherwise, call `canHandle()` on all generators, pick the one with the highest confidence.
3. If no generator returns confidence > 0, return `null`.

```typescript
export function selectGenerator(object: SceneObject): Generator | null {
  // Hint-based selection
  if (object.generator) {
    const hinted = generators.find(
      g => g.name === object.generator || object.generator?.startsWith(g.name)
    );
    if (hinted && hinted.canHandle(object) > 0) {
      return hinted;
    }
  }

  // Confidence-based selection
  let best: Generator | null = null;
  let bestConfidence = 0;
  for (const gen of generators) {
    const confidence = gen.canHandle(object);
    if (confidence > bestConfidence) {
      best = gen;
      bestConfidence = confidence;
    }
  }
  return best;
}
```

- [ ] **Step 3: Implement generateObject — the main entry point**

This wraps selection + generation + error handling. On failure, returns a magenta wireframe cube (per spec error handling rules).

```typescript
import * as THREE from 'three/webgpu';
import { ERROR_MARKER_COLOR } from './types.ts';

export function generateObject(object: SceneObject): GeneratorResult {
  const generator = selectGenerator(object);

  if (!generator) {
    console.warn(`No generator found for object "${object.id}" (prompt: "${object.prompt}")`);
    return createErrorMarker(object);
  }

  try {
    return generator.generate(object);
  } catch (err) {
    console.error(`Generator "${generator.name}" failed for object "${object.id}":`, err);
    return createErrorMarker(object);
  }
}

function createErrorMarker(object: SceneObject): GeneratorResult {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: ERROR_MARKER_COLOR,
    wireframe: true,
  });
  return {
    geometry,
    material,
    metadata: {
      vertexCount: geometry.attributes.position.count,
      faceCount: geometry.index ? geometry.index.count / 3 : 0,
      generator: 'error-marker',
      prompt: object.prompt,
      generationTime: 0,
    },
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/generators/index.ts
git commit -m "feat: add generator registry with confidence-based selection

Registers generators, selects best match via hint or confidence score,
and falls back to a magenta wireframe error marker on failure."
```

---

### Task 4: Implement CSG Generator

**Files:**
- Create: `src/pipeline/generators/csg.ts`

- [ ] **Step 1: Understand three-bvh-csg API**

The library provides:
- `Brush` — extends `Mesh`, wraps a geometry for CSG operations
- `Evaluator` — performs boolean operations
- Constants: `ADDITION` (union), `SUBTRACTION` (subtract), `INTERSECTION` (intersect)

Usage pattern:
```typescript
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';

const brushA = new Brush(new THREE.BoxGeometry(2, 0.8, 0.4));
const brushB = new Brush(new THREE.SphereGeometry(0.3));
brushB.position.set(0, 0.4, 0.2);
brushB.updateMatrixWorld();

const evaluator = new Evaluator();
const result = evaluator.evaluate(brushA, brushB, SUBTRACTION);
// result is a Mesh with the CSG result geometry
```

- [ ] **Step 2: Implement primitive factory**

Map YAML primitive names to Three.js geometries:

| YAML key | Three.js Geometry | Args |
|----------|------------------|------|
| `box` | `BoxGeometry` | `[width, height, depth]` |
| `sphere` | `SphereGeometry` | `[radius]` (add segments: 32, 24) |
| `cylinder` | `CylinderGeometry` | `[radius, height]` (radiusTop = radiusBottom = radius) |
| `cone` | `ConeGeometry` | `[radius, height]` |
| `torus` | `TorusGeometry` | `[radius, tube]` |

```typescript
function createPrimitive(type: string, args: number[]): THREE.BufferGeometry {
  switch (type) {
    case 'box': return new THREE.BoxGeometry(args[0], args[1], args[2]);
    case 'sphere': return new THREE.SphereGeometry(args[0], 32, 24);
    case 'cylinder': return new THREE.CylinderGeometry(args[0], args[0], args[1], 32);
    case 'cone': return new THREE.ConeGeometry(args[0], args[1], 32);
    case 'torus': return new THREE.TorusGeometry(args[0], args[1], 16, 48);
    default: throw new Error(`Unknown CSG primitive: ${type}`);
  }
}
```

- [ ] **Step 3: Implement CSG operation parser**

Parse the `params.operations` array from the scene YAML. Each operation is an object with one key (the operation type: `union`, `subtract`, `intersect`) and a value that is an array of primitives. Each primitive is an object with one key (the primitive type) and optional `position` and `rotation`.

```typescript
interface CsgPrimitiveDef {
  [primitiveType: string]: number[];  // e.g., { box: [2, 0.8, 0.4] }
  position?: [number, number, number];
  rotation?: [number, number, number];
}

interface CsgOperation {
  union?: CsgPrimitiveDef[];
  subtract?: CsgPrimitiveDef[];
  intersect?: CsgPrimitiveDef[];
}
```

For each operation:
1. Create Brush objects for each primitive
2. Apply position/rotation transforms to each brush
3. Evaluate the boolean operation sequentially (fold left)

- [ ] **Step 4: Implement canHandle**

The CSG generator returns high confidence (0.9) when `object.generator === 'csg'`. It returns moderate confidence (0.4) when the prompt contains keywords like "boolean", "subtract", "hollow", "cut", "hole", "mechanical", "furniture", "container", "box-shaped", "housing". Returns 0 otherwise.

```typescript
const CSG_KEYWORDS = [
  'boolean', 'subtract', 'hollow', 'cut', 'hole', 'slot',
  'mechanical', 'housing', 'enclosure', 'bracket', 'mount',
  'table', 'shelf', 'cabinet', 'container', 'box', 'crate',
  'wall', 'door', 'window', 'arch', 'pillar', 'barrier',
];

canHandle(object: SceneObject): number {
  if (object.generator === 'csg') return 0.9;
  if (object.params?.operations) return 0.85;
  const prompt = object.prompt.toLowerCase();
  const matchCount = CSG_KEYWORDS.filter(kw => prompt.includes(kw)).length;
  if (matchCount >= 2) return 0.5;
  if (matchCount === 1) return 0.3;
  return 0;
}
```

- [ ] **Step 5: Implement generate method**

1. Read `object.params.operations` if present
2. If no operations provided, create a simple box from the prompt (fallback — in practice, Ralph provides operations)
3. For each operation, evaluate the CSG boolean
4. Return the final geometry with metadata

Edge cases:
- Empty operations array: return a unit box
- Single primitive with no operations: return that primitive's geometry directly
- Degenerate result (zero vertices): throw error (caught by registry, triggers error marker)

- [ ] **Step 6: Register the CSG generator**

At the bottom of `csg.ts`, import and call `registerGenerator`:

```typescript
import { registerGenerator } from './index.ts';
registerGenerator(csgGenerator);
```

Alternatively, export the generator and register it from a central `init.ts` or from the registry's `index.ts`. Prefer explicit registration at module load — the registry `index.ts` should import `./csg.ts` as a side effect.

**Decision:** Use explicit imports in `src/pipeline/generators/index.ts`:

```typescript
// Side-effect imports to register generators
import './csg.ts';
```

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/generators/csg.ts src/pipeline/generators/index.ts
git commit -m "feat: implement CSG generator with boolean operations on primitives

Supports union, subtract, and intersect on box/sphere/cylinder/cone/torus.
Parses operations from scene YAML params or falls back to a simple box."
```

---

### Task 5: Implement SDF Primitive Library

**Files:**
- Create: `src/pipeline/generators/sdf-lib.ts`

- [ ] **Step 1: Understand TSL function patterns**

From existing demos (`tsl-torus`, `procedural-terrain`), TSL functions are created using:
- `Fn(() => { ... })` for reusable shader functions
- Arithmetic via `.add()`, `.sub()`, `.mul()`, `.div()`
- Built-in nodes: `float()`, `vec3()`, `length()`, `abs()`, `max()`, `min()`, `sin()`, `cos()`
- Position via `positionLocal`

SDF primitives operate on a position vector `p` and return a float distance value.

- [ ] **Step 2: Implement SDF primitive functions**

Each function takes TSL node inputs and returns a TSL float node representing the signed distance.

**Sphere:** `length(p) - r`
```typescript
export const sdfSphere = (p: ShaderNodeObject<Node>, r: ShaderNodeObject<Node>) =>
  length(p).sub(r);
```

**Box:** Standard SDF box formula
```typescript
export const sdfBox = (p: ShaderNodeObject<Node>, b: ShaderNodeObject<Node>) => {
  const q = abs(p).sub(b);
  return length(max(q, float(0.0))).add(min(max(q.x, max(q.y, q.z)), float(0.0)));
};
```

**Torus:** `length(vec2(length(p.xz) - t.x, p.y)) - t.y`
```typescript
export const sdfTorus = (p: ShaderNodeObject<Node>, majorR: ShaderNodeObject<Node>, minorR: ShaderNodeObject<Node>) => {
  const q = vec2(length(vec2(p.x, p.z)).sub(majorR), p.y);
  return length(q).sub(minorR);
};
```

**Cylinder:** `length(p.xz) - r` with capped height
```typescript
export const sdfCylinder = (p: ShaderNodeObject<Node>, r: ShaderNodeObject<Node>, h: ShaderNodeObject<Node>) => {
  const d = vec2(length(vec2(p.x, p.z)).sub(r), abs(p.y).sub(h));
  return min(max(d.x, d.y), float(0.0)).add(length(max(d, float(0.0))));
};
```

**Cone:** Standard SDF cone
```typescript
export const sdfCone = (p: ShaderNodeObject<Node>, angle: ShaderNodeObject<Node>, h: ShaderNodeObject<Node>) => {
  // Implementation using angle and height
};
```

**Capsule:** `length(p - clamp(p projected onto axis)) - r`
```typescript
export const sdfCapsule = (p: ShaderNodeObject<Node>, a: ShaderNodeObject<Node>, b: ShaderNodeObject<Node>, r: ShaderNodeObject<Node>) => {
  // Line segment capsule SDF
};
```

- [ ] **Step 3: Implement SDF combination operations**

**Union:** `min(d1, d2)`
```typescript
export const sdfUnion = (d1: ShaderNodeObject<Node>, d2: ShaderNodeObject<Node>) =>
  min(d1, d2);
```

**Smooth union:** Blends two SDFs with smoothing factor k
```typescript
export const sdfSmoothUnion = (d1: ShaderNodeObject<Node>, d2: ShaderNodeObject<Node>, k: ShaderNodeObject<Node>) => {
  const h = max(k.sub(abs(d1.sub(d2))), float(0.0)).div(k);
  return min(d1, d2).sub(h.mul(h).mul(k).mul(float(0.25)));
};
```

**Subtract:** `max(d1, -d2)`
```typescript
export const sdfSubtract = (d1: ShaderNodeObject<Node>, d2: ShaderNodeObject<Node>) =>
  max(d1, d2.negate());
```

**Intersect:** `max(d1, d2)`
```typescript
export const sdfIntersect = (d1: ShaderNodeObject<Node>, d2: ShaderNodeObject<Node>) =>
  max(d1, d2);
```

- [ ] **Step 4: Implement SDF domain operations**

**Twist:** Rotates the position around Y axis based on height
```typescript
export const sdfTwist = (p: ShaderNodeObject<Node>, k: ShaderNodeObject<Node>) => {
  const angle = p.y.mul(k);
  const c = cos(angle);
  const s = sin(angle);
  const xz = vec2(p.x.mul(c).sub(p.z.mul(s)), p.x.mul(s).add(p.z.mul(c)));
  return vec3(xz.x, p.y, xz.y);
};
```

**Repeat:** Infinite repetition along one or more axes
```typescript
export const sdfRepeat = (p: ShaderNodeObject<Node>, period: ShaderNodeObject<Node>) => {
  // mod(p + 0.5*period, period) - 0.5*period
};
```

**Round:** Adds rounding to any SDF
```typescript
export const sdfRound = (d: ShaderNodeObject<Node>, r: ShaderNodeObject<Node>) =>
  d.sub(r);
```

- [ ] **Step 5: Export all functions from sdf-lib**

Export every primitive, combination, and domain function as named exports. Document each with a JSDoc comment describing inputs and output.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/generators/sdf-lib.ts
git commit -m "feat: add SDF primitive library with TSL functions

Includes sphere, box, torus, cylinder, cone, capsule primitives.
Combination ops: union, smooth_union, subtract, intersect.
Domain ops: twist, repeat, round."
```

---

### Task 6: Implement SDF Raymarching Generator

**Files:**
- Create: `src/pipeline/generators/sdf.ts`

**Depends on:** Task 5 (sdf-lib.ts must exist)

- [ ] **Step 1: Understand the SDF rendering approach**

The SDF generator returns:
- **geometry**: A `BoxGeometry` bounding box that contains the SDF shape. The box is typically `[-2, 2]^3` (4x4x4 units) but adjustable via params.
- **material**: A `MeshBasicNodeMaterial` with a custom fragment shader that raymarches the SDF. The raymarching shader:
  1. Gets the ray origin (camera position) and ray direction (from camera through fragment)
  2. Steps along the ray evaluating the SDF
  3. When distance < epsilon, colors the pixel based on the SDF normal
  4. If max steps reached, discards the fragment (`discard`)
- **isSdf**: `true` (scene renderer skips material pipeline)

- [ ] **Step 2: Implement the raymarching material builder**

Create a function that takes an SDF composition function (TSL node) and returns a `MeshBasicNodeMaterial`.

The raymarching loop in TSL uses `Fn()` with a loop construct. TSL supports `Loop()` for iteration:

```typescript
import { Loop, Break, ... } from 'three/tsl';
```

The material builder:
1. Computes ray origin and direction from `cameraPosition` and `positionWorld`
2. Marches in a `Loop(MAX_STEPS)` — evaluate the SDF, advance along the ray
3. When a hit is found, compute the normal via SDF gradient (central differences)
4. Apply simple diffuse lighting using the normal
5. Output color via `mat.colorNode`
6. Handle miss via `mat.fragmentNode` or alpha discard

**Key TSL imports needed:** `Fn`, `float`, `vec3`, `vec4`, `Loop`, `Break`, `If`, `cameraPosition`, `positionWorld`, `normalize`, `length`, `abs`, `max`, `min`

**Raymarching parameters:**
- `MAX_STEPS`: 64 (balance quality vs performance)
- `MAX_DIST`: 10.0
- `SURF_DIST`: 0.001 (epsilon)

- [ ] **Step 3: Implement normal estimation**

Compute the SDF gradient via central differences to get the surface normal:

```typescript
const estimateNormal = (sdfFn, p) => {
  const eps = float(0.001);
  return normalize(vec3(
    sdfFn(p.add(vec3(eps, 0, 0))).sub(sdfFn(p.sub(vec3(eps, 0, 0)))),
    sdfFn(p.add(vec3(0, eps, 0))).sub(sdfFn(p.sub(vec3(0, eps, 0)))),
    sdfFn(p.add(vec3(0, 0, eps))).sub(sdfFn(p.sub(vec3(0, 0, eps)))),
  ));
};
```

- [ ] **Step 4: Implement canHandle**

```typescript
canHandle(object: SceneObject): number {
  if (object.generator === 'sdf') return 0.9;
  if (object.material?.shader?.includes('sdf')) return 0.7;
  const prompt = object.prompt.toLowerCase();
  const SDF_KEYWORDS = [
    'organic', 'alien', 'abstract', 'blob', 'morph', 'smooth',
    'melting', 'sci-fi', 'fractal', 'infinite', 'raymarched',
    'signed distance', 'sdf', 'metaball',
  ];
  const matchCount = SDF_KEYWORDS.filter(kw => prompt.includes(kw)).length;
  if (matchCount >= 2) return 0.6;
  if (matchCount === 1) return 0.35;
  return 0;
}
```

- [ ] **Step 5: Implement generate method**

1. Read `object.params` for bounding box size (default 4x4x4) and SDF composition hints
2. Build an SDF composition function from params or defaults:
   - If `object.params.sdf` contains a composition description, build the TSL SDF from it
   - Default: a smooth union of a sphere and a box (demonstrates the generator works)
3. Build the raymarching material using the SDF composition
4. Create the bounding box geometry
5. Return `{ geometry, material, isSdf: true, metadata }`

- [ ] **Step 6: Register the SDF generator**

Add side-effect import in `src/pipeline/generators/index.ts`:

```typescript
import './sdf.ts';
```

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/generators/sdf.ts src/pipeline/generators/index.ts
git commit -m "feat: implement SDF raymarching generator with TSL material

Renders SDF shapes via raymarching in the fragment shader. Returns a
bounding box mesh + MeshBasicNodeMaterial with the raymarching loop.
Uses sdf-lib primitives for composition."
```

---

### Task 7: Implement Parametric Terrain Generator

**Files:**
- Create: `src/pipeline/generators/parametric/index.ts`
- Create: `src/pipeline/generators/parametric/terrain.ts`

- [ ] **Step 1: Create the parametric registry**

`src/pipeline/generators/parametric/index.ts` acts as a meta-generator that delegates to category-specific generators. It implements the `Generator` interface itself, and internally holds sub-generators for each category.

```typescript
import type { Generator, SceneObject } from '../types.ts';

const parametricGenerators: Generator[] = [];

export function registerParametricGenerator(generator: Generator): void {
  parametricGenerators.push(generator);
}
```

The parametric meta-generator's `canHandle` returns the max confidence from its sub-generators. Its `generate` delegates to the best sub-generator.

Register the parametric meta-generator in the main registry:

```typescript
// In src/pipeline/generators/index.ts
import './parametric/index.ts';
```

- [ ] **Step 2: Implement the terrain generator**

The terrain generator creates a `PlaneGeometry` with noise-displaced vertices, producing rolling hills or flat plains depending on parameters.

**Parameters (from `object.params`):**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `width` | number | 20 | Terrain width |
| `depth` | number | 20 | Terrain depth |
| `segments` | number | 128 | Subdivisions per axis |
| `amplitude` | number | 2.0 | Max height displacement |
| `frequency` | number | 0.15 | Noise frequency (lower = smoother hills) |
| `octaves` | number | 4 | Noise layers (more = more detail) |
| `seed` | number | 0 | Deterministic randomness |
| `biome` | string | `'grassland'` | Affects height distribution and steepness |

**Biome presets:**
- `grassland`: low amplitude (1.5), smooth frequency (0.1), gentle rolling hills
- `mountain`: high amplitude (5.0), mixed frequency, sharp peaks
- `desert`: medium amplitude (2.0), very low frequency, broad dunes
- `canyon`: high amplitude (4.0), high frequency in one axis, deep cuts

- [ ] **Step 3: Implement noise displacement**

Use a simple hash-based noise function (no external dependency). Implement 2D value noise with octave layering:

```typescript
function noise2D(x: number, z: number, seed: number): number {
  // Simple hash-based noise
  // Layer multiple octaves for fractal detail
}

function generateTerrainHeight(
  x: number, z: number,
  frequency: number, amplitude: number, octaves: number, seed: number
): number {
  let height = 0;
  let freq = frequency;
  let amp = amplitude;
  for (let i = 0; i < octaves; i++) {
    height += noise2D(x * freq, z * freq, seed + i) * amp;
    freq *= 2.0;
    amp *= 0.5;  // persistence
  }
  return height;
}
```

- [ ] **Step 4: Generate BufferGeometry with UVs**

1. Create a `PlaneGeometry(width, depth, segments, segments)`
2. Iterate vertices, displace Y by `generateTerrainHeight(x, z, ...)`
3. Recompute normals after displacement (`geometry.computeVertexNormals()`)
4. UVs are automatically provided by `PlaneGeometry` (0-1 range) — suitable for texturing

The terrain is generated on the CPU (not via TSL vertex displacement like the demo) because the pipeline generators produce static geometry. The material pipeline handles visual effects later.

- [ ] **Step 5: Implement canHandle**

```typescript
canHandle(object: SceneObject): number {
  if (object.generator === 'parametric/terrain') return 0.95;
  if (object.generator?.startsWith('parametric') && object.params?.biome) return 0.8;
  const prompt = object.prompt.toLowerCase();
  const TERRAIN_KEYWORDS = [
    'terrain', 'ground', 'landscape', 'hill', 'mountain', 'valley',
    'plain', 'mesa', 'canyon', 'dune', 'cliff', 'plateau',
    'floor', 'land', 'earth', 'dirt',
  ];
  const matchCount = TERRAIN_KEYWORDS.filter(kw => prompt.includes(kw)).length;
  if (matchCount >= 2) return 0.7;
  if (matchCount === 1) return 0.45;
  return 0;
}
```

- [ ] **Step 6: Register the terrain generator**

In `parametric/terrain.ts`, export the generator. In `parametric/index.ts`, import and register it:

```typescript
import './terrain.ts';
```

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/generators/parametric/index.ts src/pipeline/generators/parametric/terrain.ts src/pipeline/generators/index.ts
git commit -m "feat: implement parametric terrain generator with biome presets

Generates displaced PlaneGeometry with octave noise. Supports grassland,
mountain, desert, and canyon biomes. Produces UVs for material pipeline."
```

---

### Task 8: Implement Parametric Rock Generator

**Files:**
- Create: `src/pipeline/generators/parametric/rock.ts`

- [ ] **Step 1: Design the rock generation approach**

Rocks are generated by:
1. Starting with an `IcosahedronGeometry` (provides good vertex distribution for organic shapes)
2. Displacing each vertex outward/inward using noise, creating irregular bumpy surfaces
3. Scaling the result to the desired size

This is a proven technique for procedural rocks in game development.

- [ ] **Step 2: Implement rock parameters**

**Parameters (from `object.params`):**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `radius` | number | 1.0 | Base radius |
| `detail` | number | 3 | Icosahedron subdivision level (0-5). Higher = smoother but more vertices |
| `roughness` | number | 0.3 | Noise amplitude as fraction of radius (0 = perfect sphere, 1 = very jagged) |
| `frequency` | number | 2.0 | Noise frequency (higher = smaller bumps) |
| `seed` | number | 0 | Deterministic randomness |
| `flatten` | number | 0.0 | How much to squash vertically (0 = round, 0.5 = half height, like a river stone) |
| `variant` | string | `'boulder'` | Shape variant: `'boulder'` (rounded), `'jagged'` (sharp), `'flat'` (river stone) |

**Variant presets:**
- `boulder`: detail 3, roughness 0.25, frequency 1.5 — smooth round boulders
- `jagged`: detail 2, roughness 0.5, frequency 3.0 — sharp craggy rocks
- `flat`: detail 3, roughness 0.15, frequency 1.0, flatten 0.6 — river stones
- `rubble`: detail 1, roughness 0.4, frequency 2.5 — small debris chunks

- [ ] **Step 3: Implement noise displacement for rock vertices**

For each vertex:
1. Get the vertex normal direction (from the original icosahedron center)
2. Sample 3D noise at the vertex position (scaled by frequency)
3. Displace the vertex along its normal by `noise * roughness * radius`
4. Apply flatten by scaling Y component

Use 3D value noise (extend the 2D noise from terrain to 3D):

```typescript
function noise3D(x: number, y: number, z: number, seed: number): number {
  // Hash-based 3D value noise
}
```

- [ ] **Step 4: Generate BufferGeometry with UVs**

1. Create `IcosahedronGeometry(radius, detail)`
2. Convert to non-indexed geometry (`geometry.toNonIndexed()`) for per-face normals on jagged variant
3. Iterate position attribute, displace each vertex
4. Apply vertical flattening
5. Recompute normals
6. Generate spherical UVs (atan2/asin mapping) since icosahedron UVs are not great for texturing

- [ ] **Step 5: Implement canHandle**

```typescript
canHandle(object: SceneObject): number {
  if (object.generator === 'parametric/rock') return 0.95;
  const prompt = object.prompt.toLowerCase();
  const ROCK_KEYWORDS = [
    'rock', 'boulder', 'stone', 'pebble', 'rubble', 'gravel',
    'cliff face', 'crag', 'ore', 'mineral', 'crystal formation',
    'cobble', 'slab', 'outcrop',
  ];
  const matchCount = ROCK_KEYWORDS.filter(kw => prompt.includes(kw)).length;
  if (matchCount >= 2) return 0.7;
  if (matchCount === 1) return 0.5;
  return 0;
}
```

- [ ] **Step 6: Register the rock generator**

In `parametric/index.ts`:

```typescript
import './rock.ts';
```

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/generators/parametric/rock.ts src/pipeline/generators/parametric/index.ts
git commit -m "feat: implement parametric rock generator with variant presets

Displaced icosahedron geometry with 3D noise. Supports boulder, jagged,
flat, and rubble variants. Generates spherical UVs for material pipeline."
```

---

### Task 9: Implement Parametric Vegetation Generator

**Files:**
- Create: `src/pipeline/generators/parametric/vegetation.ts`

- [ ] **Step 1: Design the vegetation generation approach**

Vegetation is generated as a combined mesh (trunk + foliage) using an L-system-inspired approach simplified for real-time use:

**Tree structure:**
1. **Trunk**: A tapered `CylinderGeometry` (wider at base, narrower at top)
2. **Branches**: Smaller cylinders attached at angles along the trunk
3. **Foliage**: Clusters of `SphereGeometry` or `IcosahedronGeometry` at branch tips and crown

All sub-meshes are merged into a single `BufferGeometry` using `BufferGeometryUtils.mergeGeometries()` from Three.js.

**Bush structure:**
1. No trunk (or very short)
2. Multiple overlapping spherical foliage volumes

- [ ] **Step 2: Implement vegetation parameters**

**Parameters (from `object.params`):**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | `'tree'` | `'tree'`, `'bush'`, `'pine'`, `'palm'` |
| `height` | number | 4.0 | Total height |
| `trunkRadius` | number | 0.2 | Trunk base radius |
| `trunkTaper` | number | 0.6 | How much trunk narrows (0 = uniform, 1 = point) |
| `branchCount` | number | 5 | Number of main branches |
| `branchAngle` | number | 45 | Branch spread angle (degrees) |
| `foliageRadius` | number | 1.5 | Radius of foliage clusters |
| `foliageDensity` | number | 5 | Number of foliage volumes |
| `seed` | number | 0 | Deterministic randomness |

**Type presets:**
- `tree` (deciduous): medium trunk, wide branching, round foliage clusters at top
- `pine` (conifer): tall narrow trunk, short branches angled down, cone-shaped foliage layers
- `palm`: tall thin trunk with slight curve, fan of foliage at very top only
- `bush`: no visible trunk, dense cluster of foliage spheres near ground

- [ ] **Step 3: Implement trunk generation**

```typescript
function generateTrunk(height: number, baseRadius: number, taper: number, segments: number): THREE.BufferGeometry {
  const topRadius = baseRadius * (1 - taper);
  return new THREE.CylinderGeometry(topRadius, baseRadius, height, segments);
}
```

Position the trunk so its base is at y=0 (translate up by height/2).

- [ ] **Step 4: Implement branch generation**

For each branch:
1. Pick a height along the trunk (distributed from 40% to 80% of trunk height, using seeded random)
2. Pick a rotation around the trunk (evenly distributed with slight jitter)
3. Create a small `CylinderGeometry` for the branch
4. Rotate and position it relative to the trunk
5. Apply the transform to the geometry vertices directly (using `geometry.applyMatrix4()`)

This avoids needing a scene graph — all transforms are baked into vertex positions.

- [ ] **Step 5: Implement foliage generation**

For each foliage cluster:
1. Position at branch tips or crown area
2. Create a low-poly `IcosahedronGeometry(foliageRadius * randomScale, 1)`
3. Slightly displace vertices with noise for organic look
4. Apply position transform

For pine trees: use `ConeGeometry` layers stacked vertically instead of sphere clusters.
For palm: use a flattened `SphereGeometry` at the top, stretched horizontally.

- [ ] **Step 6: Merge all sub-geometries**

Use Three.js `mergeGeometries` (available from `three/examples/jsm/utils/BufferGeometryUtils.js` or built-in if available):

```typescript
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const merged = mergeGeometries([trunkGeom, ...branchGeoms, ...foliageGeoms]);
```

If `mergeGeometries` is not available at that import path in r183, implement a simple merge: concatenate position/normal/uv attributes and reindex.

Ensure all sub-geometries have matching attributes (position, normal, uv) before merging.

- [ ] **Step 7: Implement canHandle**

```typescript
canHandle(object: SceneObject): number {
  if (object.generator === 'parametric/vegetation') return 0.95;
  const prompt = object.prompt.toLowerCase();
  const VEG_KEYWORDS = [
    'tree', 'bush', 'shrub', 'hedge', 'pine', 'palm', 'oak',
    'forest', 'vegetation', 'plant', 'foliage', 'canopy',
    'trunk', 'branch', 'leaf', 'flower', 'grass', 'fern',
    'bamboo', 'willow', 'birch', 'maple', 'redwood',
  ];
  const matchCount = VEG_KEYWORDS.filter(kw => prompt.includes(kw)).length;
  if (matchCount >= 2) return 0.7;
  if (matchCount === 1) return 0.5;
  return 0;
}
```

- [ ] **Step 8: Register the vegetation generator**

In `parametric/index.ts`:

```typescript
import './vegetation.ts';
```

- [ ] **Step 9: Commit**

```bash
git add src/pipeline/generators/parametric/vegetation.ts src/pipeline/generators/parametric/index.ts
git commit -m "feat: implement parametric vegetation generator with tree/bush/pine/palm

Combines trunk, branches, and foliage into a single merged BufferGeometry.
Supports four vegetation types with seeded randomness for variation."
```

---

### Task 10: Tests for All Generators

**Files:**
- Create: `src/pipeline/generators/__tests__/types.test.ts`
- Create: `src/pipeline/generators/__tests__/csg.test.ts`
- Create: `src/pipeline/generators/__tests__/sdf.test.ts`
- Create: `src/pipeline/generators/__tests__/sdf-lib.test.ts`
- Create: `src/pipeline/generators/__tests__/parametric.test.ts`

**Note on Three.js in Vitest:** Three.js requires a WebGL/WebGPU context. Tests run in Node.js without a GPU. Two strategies:

- **Strategy A (preferred for generator tests):** Test the generator logic (canHandle, parameter parsing, geometry generation) by mocking `three/webgpu` with a minimal shim that provides `BoxGeometry`, `SphereGeometry`, etc. as stubs returning objects with `attributes.position.count`.
- **Strategy B (for SDF lib):** The SDF library returns TSL nodes which are just objects. Test that the function calls produce node objects without actually running a shader. Verify the node graph structure.

- [ ] **Step 1: Create types and registry tests**

`src/pipeline/generators/__tests__/types.test.ts`:

Test cases:
- Generator interface shape: verify a minimal generator can be registered and selected
- `selectGenerator` with hint: returns the hinted generator when confidence > 0
- `selectGenerator` without hint: returns highest confidence
- `selectGenerator` with no match: returns null
- `generateObject` with no matching generator: returns error marker (wireframe box)
- `generateObject` with a throwing generator: returns error marker
- Error marker has `ERROR_MARKER_COLOR` and wireframe=true

- [ ] **Step 2: Create CSG generator tests**

`src/pipeline/generators/__tests__/csg.test.ts`:

Test cases:
- `canHandle` returns 0.9 for `generator: 'csg'`
- `canHandle` returns 0.85 for objects with `params.operations`
- `canHandle` returns > 0 for prompts with CSG keywords
- `canHandle` returns 0 for unrelated prompts (e.g., "a fluffy cat")
- `generate` with a simple union of two boxes: returns geometry with vertex count > 0
- `generate` with subtract: returns geometry (fewer vertices than union typically)
- `generate` with no operations and no matching prompt: returns fallback box
- Primitive factory: each type (box, sphere, cylinder, cone, torus) creates valid geometry
- Unknown primitive type: throws error

- [ ] **Step 3: Create SDF library tests**

`src/pipeline/generators/__tests__/sdf-lib.test.ts`:

Since TSL nodes don't execute in Node.js, test that:
- Each SDF function is exported and is a function
- Each function returns a node-like object when called with mock inputs
- (If TSL nodes can be partially evaluated) verify simple cases like `sdfSphere` at origin returns `-r`

May need to mock `three/tsl` imports. If mocking is too brittle, test only that the functions exist and are callable (smoke tests).

- [ ] **Step 4: Create SDF generator tests**

`src/pipeline/generators/__tests__/sdf.test.ts`:

Test cases:
- `canHandle` returns 0.9 for `generator: 'sdf'`
- `canHandle` returns > 0 for SDF-related prompts
- `canHandle` returns 0 for unrelated prompts
- `generate` returns a result with `isSdf: true`
- `generate` result has both geometry and material
- Geometry is a BoxGeometry (bounding box)
- Material is a `MeshBasicNodeMaterial`

- [ ] **Step 5: Create parametric generator tests**

`src/pipeline/generators/__tests__/parametric.test.ts`:

**Terrain tests:**
- `canHandle` returns 0.95 for `generator: 'parametric/terrain'`
- `canHandle` returns > 0 for terrain-related prompts
- `generate` produces a PlaneGeometry with displaced vertices
- Default terrain has expected segment count (128x128)
- Biome presets override amplitude and frequency
- Generated geometry has normals and UVs
- Same seed produces same geometry (deterministic)

**Rock tests:**
- `canHandle` returns 0.95 for `generator: 'parametric/rock'`
- `generate` produces geometry with vertex count matching icosahedron detail level
- Variant presets apply expected parameter overrides
- Flatten parameter reduces Y range of vertices
- Same seed produces same geometry (deterministic)

**Vegetation tests:**
- `canHandle` returns 0.95 for `generator: 'parametric/vegetation'`
- `generate` produces merged geometry (vertex count > single cylinder)
- Tree type has trunk + foliage
- Bush type has minimal trunk
- Pine type produces geometry (smoke test)
- Palm type produces geometry (smoke test)
- Same seed produces same geometry (deterministic)

- [ ] **Step 6: Verify all tests pass**

```bash
pnpm test
```

All tests should pass. If any fail due to Three.js import issues in Node.js, add appropriate mocks to `vitest.config.ts` or individual test files.

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/generators/__tests__/ vitest.config.ts
git commit -m "test: add tests for all geometry generators

Tests for types/registry, CSG, SDF primitives, SDF generator,
and parametric generators (terrain, rock, vegetation).
Covers canHandle confidence, generate output shape, and determinism."
```

---

## Summary

| Task | Description | Files | Depends On |
|------|-------------|-------|------------|
| 1 | Install three-bvh-csg + vitest | `package.json` | - |
| 2 | Generator types | `types.ts` | - |
| 3 | Generator registry | `index.ts` | Task 2 |
| 4 | CSG generator | `csg.ts` | Task 3 |
| 5 | SDF primitive library | `sdf-lib.ts` | Task 2 |
| 6 | SDF generator | `sdf.ts` | Task 5 |
| 7 | Parametric terrain | `parametric/index.ts`, `parametric/terrain.ts` | Task 3 |
| 8 | Parametric rock | `parametric/rock.ts` | Task 3 |
| 9 | Parametric vegetation | `parametric/vegetation.ts` | Task 3 |
| 10 | Tests | `__tests__/*.test.ts` | Tasks 4-9 |

Total: 10 tasks, 11 commits, ~10 new files + test files.
