# Prefab & Instancing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the prefab registry (register, lookup, instantiate) and GPU instancing support so objects can be defined once and placed many times efficiently.

**Architecture:** PrefabRegistry is a singleton Map storing generated geometry+material by ID. Objects with register_prefab:true are stored after generation. Objects with prefab_ref lookup from registry. Objects with instances[] create InstancedMesh with per-instance transforms. The registry is consumed by the Scene Renderer's ObjectRenderer.

**Tech Stack:** TypeScript, Three.js r183 InstancedMesh, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/pipeline/prefabs/types.ts` | Prefab interface definition |
| `src/pipeline/prefabs/registry.ts` | PrefabRegistry class (register, get, has, list, clear, instantiate) |
| `src/pipeline/prefabs/index.ts` | Public exports |
| `src/pipeline/prefabs/__tests__/registry.test.ts` | Unit tests for PrefabRegistry |

---

## Reference Material

### Existing Types

The scene spec already defines the relevant schema fields in `src/pipeline/spec/schema.ts`:
- `register_prefab: z.boolean().optional()` — on ObjectSchema (line 124)
- `prefab_ref: z.string().optional()` — on ObjectSchema (line 125)
- `instances: z.array(TransformSchema).optional()` — on ObjectSchema (line 126)
- `Transform` type — `{ position: [x,y,z], rotation: [x,y,z], scale: number | [x,y,z] }`

The generator interface in `src/pipeline/generators/types.ts` defines:
- `GeneratorResult` — `{ geometry, material?, isSdf?, metadata }`

### Proven InstancedMesh Pattern

The existing demos (particle-field, cyber-city, sprite-sparks) all follow the same pattern:
1. Create a `THREE.Object3D` dummy
2. Set `dummy.position`, `dummy.rotation`, `dummy.scale`
3. Call `dummy.updateMatrix()`
4. Call `instancedMesh.setMatrixAt(index, dummy.matrix)`
5. Set `instancedMesh.instanceMatrix.needsUpdate = true`

The `instantiate()` method must follow this exact pattern.

### Spec Error Handling Rule

From the spec (Sub-Project 1, Error Handling & Fallbacks):
> "Unknown prefab reference: skip the object, log error with the prefab_ref value"

---

### Task 1: Prefab Types

**Files:**
- Create: `src/pipeline/prefabs/types.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/pipeline/prefabs/__tests__
```

- [ ] **Step 2: Create `src/pipeline/prefabs/types.ts`**

Define the `Prefab` interface that stores a generated object's reusable data:

```typescript
import type * as THREE from 'three/webgpu';

/**
 * A prefab stores the generated geometry + material for a scene object,
 * allowing it to be reused across multiple placements without regeneration.
 */
export interface Prefab {
  /** Unique identifier — matches the object id or prefabs map key */
  id: string;
  /** Original prompt that generated this prefab */
  prompt: string;
  /** Style used during generation */
  style: string;
  /** Generated geometry (shared across all instances) */
  geometry: THREE.BufferGeometry;
  /** Generated material (shared across all instances) */
  material: THREE.Material;
  /** Generator metadata (vertex count, face count, generation time) */
  metadata?: {
    vertexCount: number;
    faceCount: number;
    generator: string;
    generationTime: number;
  };
}
```

Keep this minimal. The spec also mentions `lod` and `collision` on Prefab, but those systems do not exist yet. They can be added to this interface when Sub-Project 6 (LOD) is implemented. Do NOT add them now.

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/prefabs/types.ts
git commit -m "feat(prefabs): add Prefab type definition

Defines the Prefab interface storing geometry, material, and metadata
for reusable scene objects. Intentionally minimal — LOD and collision
fields will be added when those sub-projects are implemented."
```

---

### Task 2: PrefabRegistry Class

**Files:**
- Create: `src/pipeline/prefabs/registry.ts`

- [ ] **Step 1: Create `src/pipeline/prefabs/registry.ts`**

Implement a `PrefabRegistry` class backed by a `Map<string, Prefab>`. Methods:

| Method | Signature | Behavior |
|--------|-----------|----------|
| `register` | `(id: string, prefab: Prefab): void` | Stores a prefab. Throws if `id` already registered (prevents silent overwrites). |
| `get` | `(id: string): Prefab \| undefined` | Returns the prefab or `undefined`. |
| `has` | `(id: string): boolean` | Returns `true` if the ID is registered. |
| `list` | `(): string[]` | Returns all registered prefab IDs. |
| `clear` | `(): void` | Removes all registered prefabs. Used between scenes. |

Implementation notes:
- The class is NOT a singleton at the module level. Export the class, and let consumers create instances. The Scene Renderer will create one per scene render pass and pass it through.
- Do NOT add `instantiate()` to this class yet — that is Task 3.
- Import the `Prefab` type from `./types`.

```typescript
import type { Prefab } from './types';

export class PrefabRegistry {
  private readonly prefabs = new Map<string, Prefab>();

  register(id: string, prefab: Prefab): void {
    if (this.prefabs.has(id)) {
      throw new Error(`Prefab "${id}" is already registered. Call clear() before re-registering.`);
    }
    this.prefabs.set(id, prefab);
  }

  get(id: string): Prefab | undefined {
    return this.prefabs.get(id);
  }

  has(id: string): boolean {
    return this.prefabs.has(id);
  }

  list(): string[] {
    return Array.from(this.prefabs.keys());
  }

  clear(): void {
    this.prefabs.clear();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pipeline/prefabs/registry.ts
git commit -m "feat(prefabs): add PrefabRegistry class with register/get/has/list/clear

Map-based registry for storing generated geometry+material by ID.
Throws on duplicate registration to prevent silent overwrites."
```

---

### Task 3: `instantiate()` Method — InstancedMesh from Transforms

**Files:**
- Modify: `src/pipeline/prefabs/registry.ts`

- [ ] **Step 1: Add `instantiate()` method to PrefabRegistry**

This method takes a prefab ID and an array of `Transform` objects, and returns a `THREE.InstancedMesh` with per-instance matrices.

Signature:

```typescript
import type { Transform } from '../spec/types';

instantiate(id: string, transforms: Transform[]): THREE.InstancedMesh
```

Implementation:

1. Look up the prefab by ID. If not found, throw an error: `Prefab "${id}" not found in registry`.
2. Create `new THREE.InstancedMesh(prefab.geometry, prefab.material, transforms.length)`.
3. Create a `THREE.Object3D` dummy (reused for all transforms).
4. For each transform in the array:
   a. Set `dummy.position.set(t.position[0], t.position[1], t.position[2])`
   b. Convert rotation from degrees to radians: `dummy.rotation.set(t.rotation[0] * DEG2RAD, t.rotation[1] * DEG2RAD, t.rotation[2] * DEG2RAD)`
   c. Handle scale — if `number`, use `dummy.scale.setScalar(s)`. If `[x,y,z]`, use `dummy.scale.set(s[0], s[1], s[2])`.
   d. Call `dummy.updateMatrix()`
   e. Call `mesh.setMatrixAt(index, dummy.matrix)`
5. Set `mesh.instanceMatrix.needsUpdate = true`.
6. Return the mesh.

Use `THREE.MathUtils.DEG2RAD` for the conversion constant.

This follows the exact same pattern proven in the existing demos (particle-field, cyber-city, sprite-sparks).

- [ ] **Step 2: Commit**

```bash
git add src/pipeline/prefabs/registry.ts
git commit -m "feat(prefabs): add instantiate() method for GPU instancing

Creates InstancedMesh from a prefab ID + Transform[] array.
Converts rotation degrees to radians, handles uniform and per-axis scale.
Follows the proven InstancedMesh pattern from existing demos."
```

---

### Task 4: Integration with ObjectRenderer

**Files:**
- Modify: `src/pipeline/prefabs/registry.ts` (add a helper function)

This task adds a standalone `resolveObject()` utility function that the future ObjectRenderer will call. Since the ObjectRenderer (`src/pipeline/renderer/object-renderer.tsx`) does not exist yet (Sub-Project 4), this task creates a documented helper function that encapsulates the prefab resolution logic, ready for the renderer to consume.

- [ ] **Step 1: Add `resolvePrefab()` helper function**

Add an exported function to `registry.ts` (outside the class) that encapsulates the prefab workflow for a single scene object:

```typescript
import type { SceneObject } from '../spec/types';
import type { GeneratorResult } from '../generators/types';

/**
 * After an object is generated, optionally register it as a prefab.
 * Call this after geometry generation for every object.
 */
export function maybeRegisterPrefab(
  registry: PrefabRegistry,
  object: SceneObject,
  result: GeneratorResult,
): void {
  if (object.register_prefab) {
    registry.register(object.id, {
      id: object.id,
      prompt: object.prompt,
      style: object.style ?? 'realistic',
      geometry: result.geometry,
      material: result.material ?? new THREE.MeshStandardNodeMaterial(),
      metadata: result.metadata,
    });
  }
}

/**
 * If an object references a prefab, look it up.
 * Returns the Prefab if found, undefined if no prefab_ref is set.
 * Logs a warning and returns undefined if the ref is set but not found
 * (matching spec: "Unknown prefab reference: skip the object, log error").
 */
export function lookupPrefab(
  registry: PrefabRegistry,
  object: SceneObject,
): Prefab | undefined {
  if (!object.prefab_ref) return undefined;

  const prefab = registry.get(object.prefab_ref);
  if (!prefab) {
    console.error(`[PrefabRegistry] Unknown prefab_ref "${object.prefab_ref}" on object "${object.id}" — skipping`);
    return undefined;
  }
  return prefab;
}
```

These helpers keep the prefab logic in one module rather than scattering it across the renderer.

- [ ] **Step 2: Commit**

```bash
git add src/pipeline/prefabs/registry.ts
git commit -m "feat(prefabs): add maybeRegisterPrefab and lookupPrefab helpers

Utility functions for ObjectRenderer integration:
- maybeRegisterPrefab: stores result when register_prefab is true
- lookupPrefab: resolves prefab_ref with error logging per spec"
```

---

### Task 5: Public Exports

**Files:**
- Create: `src/pipeline/prefabs/index.ts`

- [ ] **Step 1: Create `src/pipeline/prefabs/index.ts`**

```typescript
export { PrefabRegistry, maybeRegisterPrefab, lookupPrefab } from './registry';
export type { Prefab } from './types';
```

- [ ] **Step 2: Commit**

```bash
git add src/pipeline/prefabs/index.ts
git commit -m "feat(prefabs): add public exports barrel file"
```

---

### Task 6: Tests

**Files:**
- Create: `src/pipeline/prefabs/__tests__/registry.test.ts`

- [ ] **Step 1: Write tests for PrefabRegistry**

Test cases to implement (each as a separate `it()` or `test()` block):

**Registry basics:**
1. `register() stores a prefab that can be retrieved with get()` — register a prefab, verify `get()` returns it with matching fields.
2. `register() throws on duplicate ID` — register a prefab, register again with same ID, expect error.
3. `get() returns undefined for unknown ID` — call `get('nonexistent')`, expect `undefined`.
4. `has() returns true for registered, false for unknown` — register one prefab, check both cases.
5. `list() returns all registered IDs` — register 3 prefabs, verify `list()` returns all 3 IDs.
6. `clear() removes all prefabs` — register prefabs, call `clear()`, verify `has()` returns false and `list()` is empty.

**Instancing:**
7. `instantiate() creates InstancedMesh with correct instance count` — register a prefab, call `instantiate()` with 5 transforms, verify `mesh.count === 5`.
8. `instantiate() applies position correctly` — instantiate with one transform at `[3, 4, 5]`, extract the matrix, verify the translation components (elements 12, 13, 14).
9. `instantiate() converts rotation from degrees to radians` — instantiate with rotation `[0, 90, 0]`, extract matrix, verify it represents a 90-degree Y rotation (matrix element [0] should be ~0, element [8] should be ~1, etc.).
10. `instantiate() handles uniform scale (number)` — instantiate with `scale: 2`, verify scale in extracted matrix.
11. `instantiate() handles per-axis scale ([x,y,z])` — instantiate with `scale: [1, 2, 3]`, verify scale in extracted matrix.
12. `instantiate() throws for unknown prefab ID` — call `instantiate('missing', [...])`, expect error.

**Helper functions:**
13. `maybeRegisterPrefab() registers when register_prefab is true` — pass an object with `register_prefab: true`, verify the prefab is in the registry.
14. `maybeRegisterPrefab() does nothing when register_prefab is false/undefined` — pass an object without the flag, verify registry is empty.
15. `lookupPrefab() returns prefab when ref exists` — register a prefab, pass an object with `prefab_ref`, verify it returns the prefab.
16. `lookupPrefab() returns undefined and logs error for unknown ref` — pass an object with a non-existent `prefab_ref`, verify it returns `undefined` and `console.error` was called.
17. `lookupPrefab() returns undefined when no prefab_ref is set` — pass an object without `prefab_ref`, verify it returns `undefined` without logging.

**Mock setup notes:**
- For geometry, use `new THREE.BoxGeometry(1, 1, 1)`.
- For material, use `new THREE.MeshStandardNodeMaterial()`.
- For transforms, use the `Transform` type: `{ position: [x,y,z], rotation: [x,y,z], scale: number | [x,y,z] }`.
- For `console.error` tests, use `vi.spyOn(console, 'error')`.
- Import THREE from `'three/webgpu'`.

- [ ] **Step 2: Run tests**

```bash
pnpm test -- src/pipeline/prefabs/__tests__/registry.test.ts
```

All 17 tests must pass.

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/prefabs/__tests__/registry.test.ts
git commit -m "test(prefabs): add tests for PrefabRegistry, instantiate, and helpers

17 tests covering register/get/has/list/clear, InstancedMesh creation
with position/rotation/scale transforms, and the maybeRegisterPrefab
and lookupPrefab integration helpers."
```

---

## Summary

| Task | What | Files | Commit |
|------|------|-------|--------|
| 1 | Prefab type definition | `prefabs/types.ts` | Yes |
| 2 | PrefabRegistry class (register/get/has/list/clear) | `prefabs/registry.ts` | Yes |
| 3 | `instantiate()` method (InstancedMesh from transforms) | `prefabs/registry.ts` | Yes |
| 4 | `maybeRegisterPrefab` + `lookupPrefab` helpers | `prefabs/registry.ts` | Yes |
| 5 | Public exports barrel | `prefabs/index.ts` | Yes |
| 6 | Tests (17 test cases) | `prefabs/__tests__/registry.test.ts` | Yes |

Total: 4 new files, 6 commits, ~200 lines of implementation + ~250 lines of tests.
