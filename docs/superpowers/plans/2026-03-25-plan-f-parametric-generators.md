# Additional Parametric Generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 7 more parametric generators (vehicle, character, debris, building, furniture, weapon, organic) to expand the range of objects the pipeline can generate from prompts.

**Architecture:** Each generator follows the established parametric pattern: implements the Generator interface with canHandle() confidence scoring, accepts params for variations, returns BufferGeometry with UVs. Registered in the parametric index.

**Tech Stack:** TypeScript, Three.js r183 (BufferGeometry, ExtrudeGeometry, LatheGeometry, CylinderGeometry, BoxGeometry), Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/pipeline/generators/parametric/vehicle.ts` | Cars, trucks (box body + cylinder wheels + extruded windshield) |
| `src/pipeline/generators/parametric/character.ts` | Humanoid figures (capsule torso, sphere head, cylinder limbs) |
| `src/pipeline/generators/parametric/debris.ts` | Tires, barrels, crates, pipes |
| `src/pipeline/generators/parametric/building.ts` | Structures, walls, ruins (boxes + window cutouts) |
| `src/pipeline/generators/parametric/furniture.ts` | Tables, chairs, shelves |
| `src/pipeline/generators/parametric/weapon.ts` | Swords, shields, staffs |
| `src/pipeline/generators/parametric/organic.ts` | Mushrooms, corals, alien growths |
| `src/pipeline/generators/__tests__/parametric-vehicle.test.ts` | Vehicle generator tests |
| `src/pipeline/generators/__tests__/parametric-character.test.ts` | Character generator tests |
| `src/pipeline/generators/__tests__/parametric-debris.test.ts` | Debris generator tests |
| `src/pipeline/generators/__tests__/parametric-building.test.ts` | Building generator tests |
| `src/pipeline/generators/__tests__/parametric-furniture.test.ts` | Furniture generator tests |
| `src/pipeline/generators/__tests__/parametric-weapon.test.ts` | Weapon generator tests |
| `src/pipeline/generators/__tests__/parametric-organic.test.ts` | Organic generator tests |
| `src/pipeline/generators/parametric/index.ts` | Modified: register all 7 new generators |

## Conventions

- Import Three.js as `import * as THREE from 'three/webgpu'`
- Import merge utility as `import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'`
- Use `normalizeForMerge()` and `ensureUVs()` helper pattern from `vegetation.ts` for combining different geometry types
- Use `seededRandom()` pattern from `vegetation.ts` for deterministic randomness
- Each generator exports a single named `Generator` object (e.g., `export const vehicleGenerator: Generator`)
- Each generator has a preset interface, a `Record<string, Preset>` of named presets, and a keywords array
- `canHandle()` returns 0.95 for exact generator hint match, 0.7 for 2+ keyword matches, 0.5 for 1 keyword match, 0 for no match
- All generators must be deterministic given the same seed
- Target polygon counts: 1000-5000 vertices per object
- Use `verbatimModuleSyntax` (`import type` required for type-only imports)
- Tests use Vitest — follow the patterns in `__tests__/parametric.test.ts`

## Task Dependency Order

```
Task 1  (shared helpers extraction)
  |
  +---> Task 2  (vehicle generator)
  +---> Task 3  (character generator)
  +---> Task 4  (debris generator)
  +---> Task 5  (building generator)
  +---> Task 6  (furniture generator)
  +---> Task 7  (weapon generator)
  +---> Task 8  (organic generator)
  |
Task 9  (register all generators in parametric/index.ts)
  |
Task 10 (tests for all 7 generators)
```

Tasks 2-8 can run in parallel after Task 1. Task 9 depends on all generators being complete. Task 10 depends on Task 9.

---

### Task 1: Extract Shared Helpers

**Files:**
- Create: `src/pipeline/generators/parametric/helpers.ts`
- Modify: `src/pipeline/generators/parametric/vegetation.ts` (import helpers instead of inline)

The `vegetation.ts` file contains utility functions (`normalizeForMerge`, `ensureUVs`, `seededRandom`) that all new generators will need. Extract them into a shared module.

- [ ] **Step 1: Create `helpers.ts` with shared utilities**

```typescript
// src/pipeline/generators/parametric/helpers.ts
import * as THREE from 'three/webgpu';

/** Simple seeded random number generator */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Normalize geometry for merging: convert to non-indexed and ensure UVs exist.
 * mergeGeometries requires all geometries to either be indexed or non-indexed.
 * We standardize on non-indexed to avoid compatibility issues.
 */
export function normalizeForMerge(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let geom = geometry;
  if (geom.index) {
    geom = geom.toNonIndexed();
  }
  return ensureUVs(geom);
}

/**
 * Ensure a geometry has UV attributes.
 * If none exist, generate simple spherical UVs.
 */
export function ensureUVs(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.attributes.uv) return geometry;

  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    uvs[i * 2] = 0.5 + Math.atan2(z / len, x / len) / (2 * Math.PI);
    uvs[i * 2 + 1] = 0.5 - Math.asin(Math.max(-1, Math.min(1, y / len))) / Math.PI;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * Generate box-mapped UVs for a geometry (better for boxy shapes than spherical UVs).
 * Projects UVs based on the dominant face normal axis.
 */
export function ensureBoxUVs(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometry.attributes.uv) return geometry;

  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const uvs = new Float32Array(positions.count * 2);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const nx = normals ? Math.abs(normals.getX(i)) : 0;
    const ny = normals ? Math.abs(normals.getY(i)) : 0;
    const nz = normals ? Math.abs(normals.getZ(i)) : 0;

    // Project onto the plane most facing the normal
    if (nx >= ny && nx >= nz) {
      uvs[i * 2] = z;
      uvs[i * 2 + 1] = y;
    } else if (ny >= nx && ny >= nz) {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = z;
    } else {
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = y;
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}
```

- [ ] **Step 2: Update `vegetation.ts` to import from `helpers.ts`**

Replace the inline `seededRandom`, `normalizeForMerge`, and `ensureUVs` functions with imports from `./helpers.ts`. Remove the duplicate code. Run `pnpm build` and `pnpm test` to verify nothing breaks.

- [ ] **Step 3: Verify existing tests still pass**

```bash
pnpm test -- --run src/pipeline/generators/__tests__/parametric.test.ts
```

---

### Task 2: Vehicle Generator

**Files:**
- Create: `src/pipeline/generators/parametric/vehicle.ts`

Generates cars, trucks, motorcycles, and vans from box bodies, cylinder wheels, and extruded windshields.

- [ ] **Step 1: Define the VehiclePreset interface and presets**

```typescript
interface VehiclePreset {
  bodyLength: number;
  bodyWidth: number;
  bodyHeight: number;
  cabinHeight: number;     // height of windshield/cabin area above body
  cabinSetback: number;    // how far back the cabin sits (0-1 fraction of body length)
  wheelRadius: number;
  wheelWidth: number;
  wheelCount: number;      // total wheels (4 for car, 6 for truck, 2 for motorcycle)
  wheelbase: number;       // distance between front and rear axles
  groundClearance: number;
}
```

Presets:

| Preset | Description |
|--------|-------------|
| `sedan` | Standard car: 4 wheels, medium body (length 3.5, width 1.6, height 0.8), cabin with sloped windshield |
| `truck` | Larger body (length 5, width 2, height 1.2), elevated, 6 wheels, flat cabin |
| `motorcycle` | Narrow body (length 2, width 0.5, height 0.6), 2 wheels inline, no cabin |
| `van` | Tall box body (length 4, width 1.8, height 1.8), 4 wheels, cabin at front |

- [ ] **Step 2: Implement generation functions**

Build each vehicle type by composing primitives:

**Sedan:**
- `BoxGeometry` for main body
- `BoxGeometry` for cabin (scaled, positioned on top, slightly narrower)
- 4x `CylinderGeometry` (rotated 90 degrees on Z axis) for wheels
- Position wheels at front/rear axle positions at ground clearance height

**Truck:**
- `BoxGeometry` for cargo bed (rear 60%)
- `BoxGeometry` for cabin (front 40%, taller)
- 6x `CylinderGeometry` for wheels (dual rear wheels)

**Motorcycle:**
- Narrow `BoxGeometry` for frame
- `CylinderGeometry` for engine block
- 2x `CylinderGeometry` for wheels (larger diameter, thin)
- Small `BoxGeometry` for handlebars

**Van:**
- Tall `BoxGeometry` for main body
- `BoxGeometry` for cabin section (front portion, windshield area)
- 4x `CylinderGeometry` for wheels

All parts merged via `mergeGeometries` using `normalizeForMerge()`.

- [ ] **Step 3: Implement canHandle() with keyword matching**

Keywords: `'car', 'sedan', 'vehicle', 'automobile', 'truck', 'pickup', 'lorry', 'van', 'motorcycle', 'motorbike', 'bike', 'suv', 'jeep', 'bus', 'taxi', 'cab'`

- Exact generator hint `'parametric/vehicle'` returns 0.95
- 2+ keyword matches returns 0.7
- 1 keyword match returns 0.5
- No matches returns 0

- [ ] **Step 4: Implement generate() method**

- Read `params.type` (default: `'sedan'`) to select preset
- Allow param overrides for any VehiclePreset property
- Use `seededRandom(params.seed ?? 0)` for any randomized details
- Merge all parts, compute vertex normals
- Return `GeneratorResult` with metadata (generator: `'parametric/vehicle'`)

- [ ] **Step 5: Verify build passes**

```bash
pnpm build
```

---

### Task 3: Character Generator

**Files:**
- Create: `src/pipeline/generators/parametric/character.ts`

Generates humanoid figures from primitive compositions.

- [ ] **Step 1: Define the CharacterPreset interface and presets**

```typescript
interface CharacterPreset {
  height: number;          // total character height
  headRadius: number;
  torsoHeight: number;
  torsoWidth: number;
  torsoDepth: number;
  armLength: number;
  armRadius: number;
  legLength: number;
  legRadius: number;
  pose: 'standing' | 'tpose' | 'action';
}
```

Presets:

| Preset | Description |
|--------|-------------|
| `human` | Standard humanoid proportions (height 1.8), standing pose, sphere head, box torso, cylinder limbs |
| `robot` | Blockier proportions, box head, box torso, cylinder limbs with joint spheres |
| `creature` | Hunched posture, larger head, shorter legs, wider torso, slightly asymmetric |
| `child` | Smaller proportions (height 1.0), larger head-to-body ratio |

- [ ] **Step 2: Implement generation functions**

Build each character from primitives:

**Body parts (all types):**
- Head: `SphereGeometry` (human/creature/child) or `BoxGeometry` (robot)
- Torso: `BoxGeometry` (all types, varying proportions)
- Arms: `CylinderGeometry` x2, positioned at shoulder height, angled based on pose
- Legs: `CylinderGeometry` x2, positioned at hip level, extending downward
- Hands: small `SphereGeometry` at arm endpoints
- Feet: small `BoxGeometry` at leg endpoints

**Pose variations:**
- `standing`: arms at sides (slight angle outward ~10 degrees), legs straight
- `tpose`: arms horizontal (90 degrees from torso), legs straight
- `action`: one arm raised, one leg forward (using matrix rotations)

Use `seededRandom` for slight asymmetry on the `creature` type only.

All parts merged via `mergeGeometries` using `normalizeForMerge()`.

- [ ] **Step 3: Implement canHandle() with keyword matching**

Keywords: `'character', 'human', 'humanoid', 'person', 'figure', 'robot', 'android', 'creature', 'monster', 'npc', 'soldier', 'warrior', 'villager', 'zombie', 'skeleton', 'alien humanoid', 'child', 'kid'`

- [ ] **Step 4: Implement generate() method**

- Read `params.type` (default: `'human'`) to select preset
- Read `params.pose` (default: `'standing'`) for pose
- Allow param overrides for any CharacterPreset property
- Merge all parts, compute vertex normals
- Return `GeneratorResult` with metadata (generator: `'parametric/character'`)

- [ ] **Step 5: Verify build passes**

```bash
pnpm build
```

---

### Task 4: Debris Generator

**Files:**
- Create: `src/pipeline/generators/parametric/debris.ts`

Generates tires, barrels, crates, and pipes from simple primitives.

- [ ] **Step 1: Define the DebrisPreset interface and presets**

```typescript
interface DebrisPreset {
  width: number;
  height: number;
  depth: number;
  segments: number;     // radial segments for round objects
}
```

Presets:

| Preset | Description |
|--------|-------------|
| `tire` | `TorusGeometry` (major radius 0.35, tube radius 0.12), lying flat or on side |
| `barrel` | `CylinderGeometry` (radius 0.4, height 0.9) with slight taper + lid rings (torus at top/bottom) |
| `crate` | `BoxGeometry` (0.8 x 0.8 x 0.8) with cross-plank detail (thin boxes on each face) |
| `pipe` | `CylinderGeometry` (radius 0.15, height 2.0) open-ended, optionally with elbow joint |

- [ ] **Step 2: Implement generation functions**

**Tire:**
- `TorusGeometry(0.35, 0.12, 8, 16)` for the main tire
- Optionally add a small `CylinderGeometry` disc for the hub inside
- Merge parts

**Barrel:**
- `CylinderGeometry(topRadius, bottomRadius, height, 12)` for main body (slight taper: top 90% of bottom radius)
- 2x `TorusGeometry(radius * 0.95, 0.02, 6, 16)` for metal bands at 25% and 75% height
- Merge parts

**Crate:**
- `BoxGeometry(size, size, size)` for main body
- 4x thin `BoxGeometry(size * 1.01, size * 0.08, size * 0.08)` for planks (2 horizontal, 2 vertical on front face)
- Optionally add planks on other faces for detail
- Merge parts

**Pipe:**
- `CylinderGeometry(radius, radius, length, 8, 1, true)` for open-ended pipe (openEnded=true)
- Optional: second cylinder at 90 degrees for elbow joint, connected with a `TorusGeometry` segment
- Merge parts

All parts merged via `mergeGeometries` using `normalizeForMerge()`.

- [ ] **Step 3: Implement canHandle() with keyword matching**

Keywords: `'tire', 'tyre', 'barrel', 'drum', 'crate', 'box', 'container', 'pipe', 'tube', 'debris', 'junk', 'trash', 'scrap', 'wreckage', 'rubble pile', 'dumpster'`

Note: be careful with `'box'` — only match if not preceded by `'sand'` or similar (or keep confidence lower for single-keyword matches).

- [ ] **Step 4: Implement generate() method**

- Read `params.type` (default: `'crate'`) to select preset
- Allow param overrides for size properties
- Merge all parts, compute vertex normals
- Return `GeneratorResult` with metadata (generator: `'parametric/debris'`)

- [ ] **Step 5: Verify build passes**

```bash
pnpm build
```

---

### Task 5: Building Generator

**Files:**
- Create: `src/pipeline/generators/parametric/building.ts`

Generates structures, walls, and ruins from box compositions.

- [ ] **Step 1: Define the BuildingPreset interface and presets**

```typescript
interface BuildingPreset {
  width: number;
  depth: number;
  height: number;
  floors: number;
  windowsPerFloor: number;
  windowWidth: number;
  windowHeight: number;
  hasDoor: boolean;
  hasRoof: boolean;
  roofType: 'flat' | 'gabled' | 'none';
  wallThickness: number;
  decay: number;           // 0 = pristine, 1 = fully ruined
}
```

Presets:

| Preset | Description |
|--------|-------------|
| `house` | Small structure (width 4, depth 3, height 3), 1 floor, 2 windows per floor, gabled roof, door |
| `tower` | Tall narrow structure (width 2, depth 2, height 8), 3 floors, 1 window per floor, flat roof |
| `ruin` | Broken structure (width 5, depth 4, height 4), 1 floor, decay 0.6, no roof, missing wall sections |
| `wall` | Flat wall segment (width 6, depth 0.4, height 3), no roof, no door, 0 windows |

- [ ] **Step 2: Implement generation functions**

**House/Tower (general building):**
- 4x `BoxGeometry` for walls (thin boxes forming a rectangular shell)
- Floor: `BoxGeometry(width, wallThickness, depth)` at y=0
- Windows: represented as recessed panels — thin `BoxGeometry` insets on exterior walls at calculated grid positions per floor (windowsPerFloor evenly spaced)
- Door: a `BoxGeometry` cutout area on the front wall (lower portion, centered)
- Gabled roof: 2x `BoxGeometry` angled to form an A-shape, or a `THREE.Shape` extruded via `ExtrudeGeometry` for a triangular prism
- Flat roof: `BoxGeometry(width, wallThickness, depth)` at top

**Ruin:**
- Same as house/tower but:
  - Randomly remove wall sections based on `decay` parameter using `seededRandom`
  - Reduce wall heights randomly (some walls at 50-80% of full height)
  - No roof (or partially collapsed roof — one panel only)
  - Add a few `BoxGeometry` blocks scattered at the base for fallen debris

**Wall:**
- Single `BoxGeometry(width, height, depth)` — simple and flat
- Optional: add column `BoxGeometry` pillars at each end

All parts merged via `mergeGeometries` using `normalizeForMerge()`.

- [ ] **Step 3: Implement canHandle() with keyword matching**

Keywords: `'building', 'house', 'structure', 'tower', 'ruin', 'ruins', 'wall', 'fortress', 'castle', 'shack', 'hut', 'cabin', 'warehouse', 'barn', 'church', 'temple', 'bunker', 'outpost'`

- [ ] **Step 4: Implement generate() method**

- Read `params.type` (default: `'house'`) to select preset
- Allow param overrides for all BuildingPreset properties
- Use `seededRandom(params.seed ?? 0)` for ruin decay randomization
- Merge all parts, compute vertex normals
- Return `GeneratorResult` with metadata (generator: `'parametric/building'`)

- [ ] **Step 5: Verify build passes**

```bash
pnpm build
```

---

### Task 6: Furniture Generator

**Files:**
- Create: `src/pipeline/generators/parametric/furniture.ts`

Generates tables, chairs, and shelves from box and cylinder compositions.

- [ ] **Step 1: Define the FurniturePreset interface and presets**

```typescript
interface FurniturePreset {
  width: number;
  height: number;
  depth: number;
  topThickness: number;
  legRadius: number;
  legShape: 'cylinder' | 'box';
  legCount: number;
  hasBack: boolean;        // chair back
  backHeight: number;
  shelfCount: number;      // for shelf type
}
```

Presets:

| Preset | Description |
|--------|-------------|
| `table` | Flat top (width 1.2, depth 0.8, height 0.75) + 4 cylinder legs |
| `chair` | Seat (width 0.45, depth 0.45, height 0.45) + 4 legs + back panel (backHeight 0.4) |
| `shelf` | Tall frame (width 0.8, depth 0.3, height 1.5) with 3 horizontal shelf panels, no legs — box uprights on sides |
| `bench` | Long seat (width 1.5, depth 0.4, height 0.45) + 4 box legs, no back |

- [ ] **Step 2: Implement generation functions**

**Table:**
- `BoxGeometry(width, topThickness, depth)` for table top at y=height
- 4x `CylinderGeometry(legRadius, legRadius, height - topThickness, 6)` for legs at the 4 corners (inset slightly from edges)

**Chair:**
- `BoxGeometry(width, topThickness, depth)` for seat at y=height
- 4x `CylinderGeometry(legRadius, legRadius, height, 6)` for legs
- `BoxGeometry(width, backHeight, topThickness)` for back panel at y=height+backHeight/2, z=-depth/2

**Shelf:**
- 2x `BoxGeometry(topThickness, totalHeight, depth)` for left/right uprights
- N x `BoxGeometry(width, topThickness, depth)` for shelf panels, evenly spaced vertically

**Bench:**
- Same as table but longer width, no back
- 4x `BoxGeometry(legSize, height, legSize)` for box legs

All parts merged via `mergeGeometries` using `normalizeForMerge()`.

- [ ] **Step 3: Implement canHandle() with keyword matching**

Keywords: `'table', 'chair', 'furniture', 'desk', 'shelf', 'shelves', 'bookshelf', 'bench', 'stool', 'cabinet', 'dresser', 'bed', 'couch', 'sofa', 'throne', 'workbench'`

- [ ] **Step 4: Implement generate() method**

- Read `params.type` (default: `'table'`) to select preset
- Allow param overrides for all FurniturePreset properties
- Merge all parts, compute vertex normals
- Return `GeneratorResult` with metadata (generator: `'parametric/furniture'`)

- [ ] **Step 5: Verify build passes**

```bash
pnpm build
```

---

### Task 7: Weapon Generator

**Files:**
- Create: `src/pipeline/generators/parametric/weapon.ts`

Generates swords, shields, and staffs from LatheGeometry, ExtrudeGeometry, and primitive compositions.

- [ ] **Step 1: Define the WeaponPreset interface and presets**

```typescript
interface WeaponPreset {
  length: number;          // total weapon length
  handleLength: number;
  handleRadius: number;
  bladeWidth: number;
  bladeThickness: number;
  guardWidth: number;      // crossguard width for swords
  shieldRadius: number;    // for shield type
  shieldCurvature: number; // 0 = flat, 1 = very curved
}
```

Presets:

| Preset | Description |
|--------|-------------|
| `sword` | Blade (ExtrudeGeometry from 2D diamond shape, length 0.8) + cylinder handle (length 0.25) + box crossguard (width 0.3) + sphere pommel |
| `shield` | Curved disc (SphereGeometry segment or LatheGeometry, radius 0.4) + box handle bar on back + optional boss (small sphere in center front) |
| `staff` | Long cylinder (length 1.8, radius 0.025) + decorative sphere or icosahedron at top (radius 0.08) |
| `axe` | Cylinder handle (length 0.6) + ExtrudeGeometry axe head (wedge shape from 2D path) at top |

- [ ] **Step 2: Implement generation functions**

**Sword:**
- Handle: `CylinderGeometry(handleRadius, handleRadius, handleLength, 8)` centered at bottom
- Crossguard: `BoxGeometry(guardWidth, bladeThickness * 2, bladeThickness * 2)` at handle/blade junction
- Blade: Create a `THREE.Shape` (elongated diamond/pointed rectangle profile), extrude with `ExtrudeGeometry` (depth = bladeThickness). Position above crossguard
- Pommel: `SphereGeometry(handleRadius * 1.5, 6, 6)` at bottom of handle

**Shield:**
- Main body: `SphereGeometry(shieldRadius, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.3 * (1 + shieldCurvature))` — a spherical cap. Or use `LatheGeometry` with a curved profile for more control
- Boss: `SphereGeometry(shieldRadius * 0.15, 6, 6)` centered on front face
- Handle: `BoxGeometry(shieldRadius * 0.6, 0.02, 0.04)` on back face

**Staff:**
- Shaft: `CylinderGeometry(handleRadius, handleRadius * 0.8, length, 6)` — slight taper
- Top ornament: `IcosahedronGeometry(handleRadius * 3, 1)` at the top of the shaft

**Axe:**
- Handle: `CylinderGeometry(handleRadius, handleRadius, handleLength, 6)`
- Axe head: Create a `THREE.Shape` defining a wedge/crescent profile, extrude with `ExtrudeGeometry`. Position at top of handle, perpendicular to shaft

All parts merged via `mergeGeometries` using `normalizeForMerge()`.

- [ ] **Step 3: Implement canHandle() with keyword matching**

Keywords: `'sword', 'blade', 'weapon', 'shield', 'staff', 'wand', 'axe', 'hatchet', 'mace', 'hammer', 'spear', 'lance', 'dagger', 'knife', 'bow', 'crossbow', 'club'`

- [ ] **Step 4: Implement generate() method**

- Read `params.type` (default: `'sword'`) to select preset
- Allow param overrides for all WeaponPreset properties
- Merge all parts, compute vertex normals
- Return `GeneratorResult` with metadata (generator: `'parametric/weapon'`)

- [ ] **Step 5: Verify build passes**

```bash
pnpm build
```

---

### Task 8: Organic Generator

**Files:**
- Create: `src/pipeline/generators/parametric/organic.ts`

Generates mushrooms, corals, and alien growths using LatheGeometry and noise-displaced surfaces.

- [ ] **Step 1: Define the OrganicPreset interface and presets**

```typescript
interface OrganicPreset {
  height: number;
  baseRadius: number;
  topRadius: number;
  stemHeight: number;
  stemRadius: number;
  detail: number;           // subdivision level for noise displacement
  noiseFrequency: number;
  noiseAmplitude: number;
  branchCount: number;      // for coral/growths
}
```

Presets:

| Preset | Description |
|--------|-------------|
| `mushroom` | LatheGeometry stem (narrow cylinder taper) + LatheGeometry cap (dome shape from convex profile curve) |
| `coral` | Branching structure: multiple cylinders extending upward with slight random angles, tipped with small spheres |
| `alien_growth` | Noise-displaced sphere cluster — 3-5 merged IcosahedronGeometries with heavy noise displacement (reusing noise3D pattern from rock.ts) |
| `shell` | Spiral shape via LatheGeometry with a spiral profile, or a series of scaled/rotated torus segments |

- [ ] **Step 2: Implement generation functions**

**Mushroom:**
- Stem: `LatheGeometry` from a profile curve defining a narrow cylinder that slightly widens at the base. Profile points: `[(stemRadius, 0), (stemRadius * 0.8, stemHeight * 0.5), (stemRadius * 0.6, stemHeight)]`
- Cap: `LatheGeometry` from a dome profile. Points: `[(stemRadius * 0.3, stemHeight), (topRadius, stemHeight + height * 0.1), (topRadius * 0.9, stemHeight + height * 0.25), (0, stemHeight + height * 0.35)]`
- Merge stem + cap

**Coral:**
- Use `seededRandom` to generate `branchCount` branches (default 5-8)
- Each branch: `CylinderGeometry(radius, radius * 0.6, branchHeight, 6)` with a random Y-axis rotation and slight tilt (X/Z rotation of 5-25 degrees)
- Start each branch from a central base region; some branches fork from other branches (secondary branches at 50-80% height of parent)
- Tips: `SphereGeometry(radius, 4, 4)` at each branch endpoint
- Merge all parts

**Alien Growth:**
- Generate 3-5 `IcosahedronGeometry(radius * rng(), 2)` positioned in a cluster
- Apply noise displacement to each (reuse 3D noise pattern from rock.ts): displace each vertex along its normal by `noise3D(x * freq, y * freq, z * freq, seed) * amplitude`
- Vary the frequency and amplitude per cluster member for organic variety
- Merge all displaced icosahedrons

**Shell:**
- Generate a spiral using a loop: create small `TorusGeometry` segments at increasing radius and Y position
- Or use `LatheGeometry` with a logarithmic spiral profile
- Apply slight noise displacement for organic feel

All parts merged via `mergeGeometries` using `normalizeForMerge()`.

- [ ] **Step 3: Implement canHandle() with keyword matching**

Keywords: `'mushroom', 'fungus', 'coral', 'reef', 'organic', 'growth', 'alien', 'organism', 'shell', 'snail', 'tentacle', 'polyp', 'anemone', 'barnacle', 'lichen', 'moss', 'spore', 'pod'`

- [ ] **Step 4: Implement generate() method**

- Read `params.type` (default: `'mushroom'`) to select preset
- Allow param overrides for all OrganicPreset properties
- Use `seededRandom(params.seed ?? 0)` for randomization
- Merge all parts, compute vertex normals
- Return `GeneratorResult` with metadata (generator: `'parametric/organic'`)

- [ ] **Step 5: Verify build passes**

```bash
pnpm build
```

---

### Task 9: Register All Generators in Parametric Index

**Files:**
- Modify: `src/pipeline/generators/parametric/index.ts`

- [ ] **Step 1: Import all 7 new generators**

Add imports for `vehicleGenerator`, `characterGenerator`, `debrisGenerator`, `buildingGenerator`, `furnitureGenerator`, `weaponGenerator`, and `organicGenerator` from their respective files.

- [ ] **Step 2: Add them to the `parametricGenerators` array**

The array should now contain all 10 generators (3 existing + 7 new):

```typescript
const parametricGenerators: Generator[] = [
  terrainGenerator,
  rockGenerator,
  vegetationGenerator,
  vehicleGenerator,
  characterGenerator,
  debrisGenerator,
  buildingGenerator,
  furnitureGenerator,
  weaponGenerator,
  organicGenerator,
];
```

- [ ] **Step 3: Update the `generator` field in `types.ts` comment**

Update the comment on the `generator` field in `SceneObject` to include the new generator hints:

```typescript
generator?: string; // hint: 'csg' | 'parametric/terrain' | 'parametric/rock' | 'parametric/vegetation' | 'parametric/vehicle' | 'parametric/character' | 'parametric/debris' | 'parametric/building' | 'parametric/furniture' | 'parametric/weapon' | 'parametric/organic' | 'sdf' | ...
```

- [ ] **Step 4: Verify build passes**

```bash
pnpm build
```

---

### Task 10: Tests for All 7 New Generators

**Files:**
- Create: `src/pipeline/generators/__tests__/parametric-vehicle.test.ts`
- Create: `src/pipeline/generators/__tests__/parametric-character.test.ts`
- Create: `src/pipeline/generators/__tests__/parametric-debris.test.ts`
- Create: `src/pipeline/generators/__tests__/parametric-building.test.ts`
- Create: `src/pipeline/generators/__tests__/parametric-furniture.test.ts`
- Create: `src/pipeline/generators/__tests__/parametric-weapon.test.ts`
- Create: `src/pipeline/generators/__tests__/parametric-organic.test.ts`

Each test file follows the pattern in `__tests__/parametric.test.ts`. Every generator gets the same test structure:

- [ ] **Step 1: Create test file for each generator**

Each test file should contain:

**canHandle tests (per generator):**
1. Returns 0.95 for exact generator hint (e.g., `generator: 'parametric/vehicle'`)
2. Returns > 0 for related prompts (e.g., `'a red sports car'`)
3. Returns 0.7 for prompts with 2+ keywords
4. Returns 0 for unrelated prompts (e.g., `'a flying saucer'`)

**generate tests (per generator):**
1. Each preset type produces geometry with vertices (smoke test per type)
2. Geometry has `position`, `normal`, and `uv` attributes
3. Same seed produces same geometry (deterministic) — compare first 50 vertex positions
4. Vertex count is within expected range (1000-5000 for default params)
5. Metadata has correct generator name and prompt

**Example test structure** (vehicle — others follow same pattern):

```typescript
import { describe, it, expect } from 'vitest';
import { vehicleGenerator } from '../parametric/vehicle.ts';
import type { SceneObject } from '../types.ts';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return { id: 'test', prompt: 'a test object', ...overrides };
}

describe('Vehicle Generator — canHandle', () => {
  it('returns 0.95 for generator: "parametric/vehicle"', () => {
    expect(
      vehicleGenerator.canHandle(makeObj({ generator: 'parametric/vehicle' })),
    ).toBe(0.95);
  });

  it('returns > 0 for vehicle-related prompts', () => {
    expect(
      vehicleGenerator.canHandle(makeObj({ prompt: 'a red sports car' })),
    ).toBeGreaterThan(0);
  });

  it('returns 0 for unrelated prompts', () => {
    expect(
      vehicleGenerator.canHandle(makeObj({ prompt: 'a tall pine tree' })),
    ).toBe(0);
  });
});

describe('Vehicle Generator — generate', () => {
  it('sedan type produces geometry', () => {
    const result = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'car', params: { type: 'sedan' } }),
    );
    expect(result.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(result.metadata.generator).toBe('parametric/vehicle');
  });

  it('truck type produces geometry', () => { /* ... */ });
  it('motorcycle type produces geometry', () => { /* ... */ });
  it('van type produces geometry', () => { /* ... */ });

  it('geometry has normals and UVs', () => {
    const result = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'car' }),
    );
    expect(result.geometry.attributes.normal).toBeDefined();
    expect(result.geometry.attributes.uv).toBeDefined();
  });

  it('same seed produces same geometry (deterministic)', () => {
    const params = { type: 'sedan', seed: 42 };
    const r1 = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'car', params }),
    );
    const r2 = vehicleGenerator.generate(
      makeObj({ generator: 'parametric/vehicle', prompt: 'car', params }),
    );
    const pos1 = r1.geometry.attributes.position;
    const pos2 = r2.geometry.attributes.position;
    expect(pos1.count).toBe(pos2.count);
    for (let i = 0; i < Math.min(pos1.count, 50); i++) {
      expect(pos1.getX(i)).toBe(pos2.getX(i));
      expect(pos1.getY(i)).toBe(pos2.getY(i));
      expect(pos1.getZ(i)).toBe(pos2.getZ(i));
    }
  });
});
```

- [ ] **Step 2: Run all tests and verify they pass**

```bash
pnpm test -- --run
```

- [ ] **Step 3: Verify full build passes**

```bash
pnpm build
```

---

## Acceptance Criteria

1. All 7 generators produce visible, recognizable geometry when given their default params
2. Each generator has 2-4 type presets that produce distinct shapes
3. All geometries have `position`, `normal`, and `uv` attributes
4. All generators are deterministic (same seed = same output)
5. Polygon counts stay in the 1000-5000 range for default params
6. `canHandle()` correctly identifies relevant prompts and returns 0 for unrelated ones
7. All 7 generators registered in `parametric/index.ts` and selectable via the meta-generator
8. All tests pass (`pnpm test -- --run`)
9. Build succeeds (`pnpm build`)
