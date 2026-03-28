# Scene Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the SceneFromYaml React component that reads a scene.yaml file, orchestrates generators and materials, and renders a complete Three.js scene via R3F.

**Architecture:** SceneFromYaml loads YAML via the parser, iterates objects, calls generators for geometry, material resolver for materials, composes the scene graph with parent-child transforms, sets up camera/lights/environment, and renders via R3F Canvas with WebGPURenderer.

**Tech Stack:** React 19, TypeScript, @react-three/fiber, @react-three/drei, Three.js r183 WebGPURenderer, yaml, zod

---

## Context & References

| Document | Path | Purpose |
|----------|------|---------|
| Full spec | `docs/superpowers/specs/2026-03-24-model-pipeline-design.md` | Sub-Project 4 defines the scene renderer pipeline |
| Scene spec types | `src/pipeline/spec/types.ts` | Zod-inferred TypeScript types for scene YAML |
| Scene schema | `src/pipeline/spec/schema.ts` | Zod schemas with defaults for all scene fields |
| YAML parser | `src/pipeline/spec/parser.ts` | `parseScene()` / `parseSceneOrThrow()` for YAML validation |
| Generator registry | `src/pipeline/generators/index.ts` | `generateObject()` with error-marker fallback |
| Generator types | `src/pipeline/generators/types.ts` | `GeneratorResult`, `Generator`, `SceneObject` interfaces |
| Material resolver | `src/pipeline/materials/resolver.ts` | `resolveMaterial()` with full resolution order |
| Material types | `src/pipeline/materials/types.ts` | `MaterialDef`, `MaterialContext`, `PbrValues` |
| Existing Viewer | `src/components/Viewer.tsx` | Reference for Canvas/WebGPURenderer/Overlay pattern |
| Demo registry | `src/lib/registry.ts` | How demos are registered with lazy imports |
| Existing terrain demo | `src/demos/procedural-terrain/index.tsx` | Reference for R3F scene composition |

## Key Design Decisions

1. **Generator types bridge:** The generator registry currently uses its own `SceneObject` type (`src/pipeline/generators/types.ts`) which is a subset of the full spec type (`src/pipeline/spec/types.ts`). The scene renderer must adapt between these — pass the spec's `SceneObject` to `generateObject()`, which accepts the generator's `SceneObject` interface. The generator's `SceneObject` is structurally compatible (same field names, subset of fields), so this works without explicit conversion.

2. **Synchronous generation:** All generators (`csg`, `parametric/*`, `sdf`) are synchronous. The scene renderer calls `generateObject()` inside a React component and stores results via `useMemo`. No async/Suspense needed for generation itself — only for YAML fetching.

3. **Material context threading:** The material resolver needs a `MaterialContext` with `parentMaterial` and `resolvedMaterials` map for inheritance. The scene renderer must maintain a mutable `Map<string, MeshStandardNodeMaterial>` of resolved materials and pass it through the object tree.

4. **SDF special case:** When `GeneratorResult.isSdf === true`, the generator provides both geometry and material. The renderer must skip the material pipeline for that object and use `result.material` directly.

5. **Instancing:** Objects with `instances[]` use `THREE.InstancedMesh`. The generator produces the geometry once, a single material is resolved, and instance transforms are set via `InstancedMesh.setMatrixAt()`.

6. **Animation via useFrame:** R3F's `useFrame` hook drives animations. Each animated object gets a `useFrame` callback that evaluates its animation type (sine, rotate, pulse, etc.) and mutates the mesh ref's transform or material properties.

## File Structure

```
src/pipeline/renderer/
  SceneFromYaml.tsx          # Main component: Canvas + camera + env + objects
  scene-loader.ts            # YAML fetch + parse + in-memory cache
  ObjectRenderer.tsx          # Per-object: generator + material + transforms + children
  EnvironmentRenderer.tsx     # Fog, ambient light, directional/point/spot lights, background
  animation.ts               # Animation system: useFrame-driven property mutation
  index.ts                   # Public exports
```

---

## Tasks

### Task 1: Scene loader — fetch, parse, and cache YAML

**Files:** `src/pipeline/renderer/scene-loader.ts`

- [ ] Create `scene-loader.ts` with the following API:
  ```typescript
  export function useSceneLoader(scenePath: string): Scene;
  ```
- [ ] Implement `fetchScene(scenePath: string): Promise<Scene>` that:
  1. Checks an in-memory `Map<string, Scene>` cache — if the path is cached, return immediately
  2. Fetches the YAML file from the provided path via `fetch(scenePath)` (paths like `/scenes/test-scene.scene.yaml` are served from `public/`)
  3. Reads the response as text via `response.text()`
  4. Passes the text to `parseSceneOrThrow()` from `src/pipeline/spec/parser.ts`
  5. Stores the validated `Scene` object in the cache map
  6. Returns the `Scene`
  7. On fetch failure or parse failure, throws a descriptive error
- [ ] Implement `useSceneLoader(scenePath: string): Scene` as a React hook that:
  1. Uses React's `use()` hook (React 19) with a promise from `fetchScene()` — this integrates with Suspense automatically
  2. The hook should be usable inside a `<Suspense>` boundary, so the parent can show a loading fallback
  3. Store the promise in a module-level cache keyed by `scenePath` so the same path does not trigger duplicate fetches
- [ ] Export both `fetchScene` and `useSceneLoader`

**Implementation notes:**
- The cache is module-scoped (not component state) so it persists across re-renders and component mounts
- Use the React 19 `use()` pattern: create the promise eagerly, cache it, and `use()` it in the hook. This is the recommended Suspense-compatible data fetching pattern for React 19
- If `use()` is not available or causes issues, fall back to the `suspend` library pattern from @react-three/drei (throw the promise for Suspense)

**Acceptance criteria:** `useSceneLoader('/scenes/test.scene.yaml')` fetches the YAML, parses it, returns a typed `Scene` object, and caches it. Second call with the same path returns from cache without re-fetching. Parse errors throw with a descriptive message.

**Commit message:** `feat(renderer): add scene-loader with fetch, parse, and cache`

---

### Task 2: EnvironmentRenderer — fog, lights, background, ambient

**Files:** `src/pipeline/renderer/EnvironmentRenderer.tsx`

- [ ] Create `EnvironmentRenderer.tsx` as a React component:
  ```typescript
  interface EnvironmentRendererProps {
    environment: Environment;
  }
  export default function EnvironmentRenderer({ environment }: EnvironmentRendererProps);
  ```
- [ ] Implement background color:
  - Use `useThree()` to access the Three.js scene object
  - In a `useEffect`, set `scene.background = new THREE.Color(environment.background)` when `environment.background` is not `'transparent'`
  - If `'transparent'`, set `scene.background = null`
- [ ] Implement fog:
  - If `environment.fog` is defined and `type === 'linear'`, set `scene.fog = new THREE.Fog(color, near, far)` in the same useEffect
  - If `type === 'exponential'`, set `scene.fog = new THREE.FogExp2(color, density)`
  - If no fog defined, set `scene.fog = null`
- [ ] Render ambient light:
  - Return `<ambientLight color={environment.ambient.color} intensity={environment.ambient.intensity} />` as JSX
- [ ] Render lights array — map over `environment.lights` and render the appropriate R3F light component for each:
  - `type: 'directional'` — `<directionalLight position={...} color={...} intensity={...} castShadow={...} />`. If `target` is specified, use a `<group>` with `ref` to set the light's target position via `useEffect`
  - `type: 'point'` — `<pointLight position={...} color={...} intensity={...} distance={...} castShadow={...} />`
  - `type: 'spot'` — `<spotLight position={...} color={...} intensity={...} angle={angleInRadians} distance={...} castShadow={...} />`. Convert angle from degrees (spec) to radians. Handle target similarly to directional
  - `type: 'hemisphere'` — `<hemisphereLight color={...} groundColor="#444444" intensity={...} />`
  - Each light element needs a `key` — use the array index since lights are static
- [ ] Ensure all light properties use defaults from the spec when not specified: default color `'#ffffff'`, default intensity `1.0`

**Acceptance criteria:** Rendering `<EnvironmentRenderer environment={...} />` inside an R3F Canvas produces the correct fog, background color, ambient light, and directional/point/spot lights. Fog type correctly switches between `Fog` and `FogExp2`.

**Commit message:** `feat(renderer): add EnvironmentRenderer for fog, lights, and background`

---

### Task 3: ObjectRenderer — generator + material + transform

**Files:** `src/pipeline/renderer/ObjectRenderer.tsx`

- [ ] Create `ObjectRenderer.tsx` as a React component:
  ```typescript
  interface ObjectRendererProps {
    object: SceneObject;
    parentMaterial?: THREE.MeshStandardNodeMaterial;
    resolvedMaterials: Map<string, THREE.MeshStandardNodeMaterial>;
  }
  export default function ObjectRenderer({ object, parentMaterial, resolvedMaterials }: ObjectRendererProps);
  ```
- [ ] If `object.visible === false`, return `null` (skip rendering entirely)
- [ ] Generate geometry via `useMemo`:
  1. Call `generateObject(object)` from `src/pipeline/generators/index.ts`
  2. Store the `GeneratorResult` — includes `geometry`, optional `material`, `isSdf` flag, and `metadata`
  3. Log `metadata.generator` and `metadata.generationTime` to console for debugging
- [ ] Resolve material via `useMemo`:
  1. If `result.isSdf === true`, use `result.material` directly — skip the material resolver
  2. Otherwise, if `object.material` is defined, call `resolveMaterial(object.material, { parentMaterial, resolvedMaterials, objectId: object.id })` from `src/pipeline/materials/resolver.ts`
  3. If no material is defined on the object, create a default `new THREE.MeshStandardNodeMaterial()` (grey)
  4. Store the resolved material in `resolvedMaterials.set(object.id, material)` so children/siblings can inherit it
- [ ] Apply transform:
  - Wrap the mesh in a `<group>` that applies position, rotation, and scale from `object.transform`
  - Position: `position={object.transform.position}` (already [x,y,z])
  - Rotation: convert degrees to radians — `rotation={object.transform.rotation.map(d => d * Math.PI / 180)}` (spec says rotation values are in degrees)
  - Scale: if `object.transform.scale` is a number, use `scale={[s, s, s]}`. If an array, use directly
- [ ] Render the mesh:
  - `<mesh geometry={result.geometry} material={resolvedMaterial} castShadow={object.castShadow} receiveShadow={object.receiveShadow} />`
- [ ] Handle children (recursion):
  - If `object.children` is defined and non-empty, render each child as `<ObjectRenderer>` inside the same `<group>` — this makes child transforms parent-local (R3F groups compose transforms automatically)
  - Pass the current object's resolved material as `parentMaterial` to children
  - Pass the shared `resolvedMaterials` map to children

**Acceptance criteria:** `<ObjectRenderer object={...} resolvedMaterials={new Map()} />` generates geometry, resolves material, applies transforms, and renders a mesh. SDF objects use their generator-provided material. Children are rendered inside the parent group with parent-local transforms.

**Commit message:** `feat(renderer): add ObjectRenderer with generator, material, and transform`

---

### Task 4: Handle instancing — objects with instances[]

**Files:** `src/pipeline/renderer/ObjectRenderer.tsx` (extend)

- [ ] In `ObjectRenderer`, detect when `object.instances` is defined and has entries
- [ ] When instances are present, replace the single `<mesh>` with a `<instancedMesh>` approach:
  1. Create the `THREE.InstancedMesh` via `useMemo`:
     - `new THREE.InstancedMesh(result.geometry, resolvedMaterial, object.instances.length)`
  2. Set each instance transform via a `useEffect`:
     - Iterate `object.instances`, for each transform:
       - Create a `THREE.Matrix4`
       - Apply position, rotation (degrees to radians), and scale from the instance transform
       - Use `new THREE.Matrix4().compose(position, quaternion, scaleVec)` where quaternion is built from `new THREE.Euler(rx, ry, rz)` converted to radians
       - Call `instancedMesh.setMatrixAt(index, matrix)`
     - After the loop, set `instancedMesh.instanceMatrix.needsUpdate = true`
  3. Set `instancedMesh.castShadow` and `instancedMesh.receiveShadow` from the object
- [ ] Render the instanced mesh via `<primitive object={instancedMesh} />` inside the transform group
- [ ] When instances are NOT present, render the regular single `<mesh>` as before
- [ ] Note: children of instanced objects are NOT instanced — they are rendered once at the parent's transform. If children need instancing, each child must have its own `instances[]` in the scene YAML

**Acceptance criteria:** An object with `instances: [{position: [0,0,0]}, {position: [2,0,0]}, {position: [4,0,0]}]` renders 3 instanced copies at those positions. Each instance respects its rotation and scale. The geometry and material are created once and shared across all instances.

**Commit message:** `feat(renderer): add instanced mesh support for objects with instances[]`

---

### Task 5: Animation system — useFrame-driven property mutation

**Files:** `src/pipeline/renderer/animation.ts`

- [ ] Create `animation.ts` with a custom hook:
  ```typescript
  export function useAnimations(
    animations: Animation[] | undefined,
    meshRef: React.RefObject<THREE.Mesh | THREE.InstancedMesh | THREE.Group>,
    materialRef: React.RefObject<THREE.MeshStandardNodeMaterial | null>,
  ): void;
  ```
- [ ] The hook calls `useFrame((state, delta)` from `@react-three/fiber` and evaluates all animations each frame
- [ ] Implement animation type evaluators — given elapsed time, speed, amplitude, and range, compute the current value:
  - **`sine`**: `amplitude * Math.sin(elapsed * speed * Math.PI * 2)`. If `range` is set, remap from [-amplitude, amplitude] to [range[0], range[1]]
  - **`bounce`**: `amplitude * Math.abs(Math.sin(elapsed * speed * Math.PI))` — always positive, bouncing motion
  - **`rotate`**: Continuously add to the rotation: `currentValue + delta * speed * amplitude` (accumulates over time, no range needed)
  - **`sway`**: `amplitude * Math.sin(elapsed * speed * Math.PI * 2) * 0.5` — gentler version of sine, half amplitude
  - **`pulse`**: `range ? lerp(range[0], range[1], (Math.sin(elapsed * speed * Math.PI * 2) + 1) / 2) : amplitude * ((Math.sin(elapsed * speed * Math.PI * 2) + 1) / 2)` — oscillates between min and max (or 0 and amplitude)
  - **`custom`**: no-op (reserved for future use)
- [ ] Implement property path resolution — given a `property` string, apply the computed value to the mesh or material ref:
  - `transform.position.x` / `.y` / `.z` — set `meshRef.current.position.x = value` (etc.)
  - `transform.rotation.x` / `.y` / `.z` — set `meshRef.current.rotation.x = value` (convert from degrees if the animation produces degrees, but since animations operate on radians internally after initial conversion, just set directly)
  - `transform.scale` — set `meshRef.current.scale.setScalar(value)`
  - `material.pbr.opacity` — set `materialRef.current.opacity = value; materialRef.current.transparent = value < 1`
  - `material.pbr.emissive_intensity` — set `materialRef.current.emissiveIntensity = value`
  - `material.pbr.roughness` — set `materialRef.current.roughness = value`
  - `material.pbr.metalness` — set `materialRef.current.metalness = value`
  - `visibility` — set `meshRef.current.visible = value > 0.5`
  - Unknown properties: silently ignore (per spec)
- [ ] Handle `delay`: track elapsed time per animation; do not start computing values until `elapsed > delay`
- [ ] Handle `loop: false`: after one full cycle (`elapsed > 1/speed`), freeze at the final value

**Acceptance criteria:** An object with `animation: [{ property: 'transform.rotation.y', type: 'rotate', speed: 1, amplitude: 1 }]` rotates continuously around Y. An object with `animation: [{ property: 'transform.position.y', type: 'sine', speed: 0.5, amplitude: 2 }]` bobs up and down.

**Commit message:** `feat(renderer): add animation system with sine, rotate, bounce, sway, and pulse types`

---

### Task 6: Integrate animations into ObjectRenderer

**Files:** `src/pipeline/renderer/ObjectRenderer.tsx` (extend)

- [ ] Add a `useRef` for the mesh or group element in ObjectRenderer
- [ ] Add a `useRef` for the resolved material
- [ ] Call `useAnimations(object.animation, meshRef, materialRef)` from the animation module
- [ ] Ensure the refs are properly attached:
  - For non-instanced objects: attach `ref` to the `<group>` that holds the mesh (so transform animations affect the whole object including children)
  - For instanced objects: attach `ref` to the `<primitive>` wrapping the InstancedMesh
  - Material ref: store the resolved material in a `useRef` and pass it to `useAnimations`

**Acceptance criteria:** An object defined in YAML with animation fields is visibly animated when rendered. The animation runs at the specified speed and amplitude.

**Commit message:** `feat(renderer): integrate animation system into ObjectRenderer`

---

### Task 7: SceneFromYaml top-level component

**Files:** `src/pipeline/renderer/SceneFromYaml.tsx`

- [ ] Create `SceneFromYaml.tsx`:
  ```typescript
  interface SceneFromYamlProps {
    scenePath: string;
  }
  export default function SceneFromYaml({ scenePath }: SceneFromYamlProps);
  ```
- [ ] Inside the component:
  1. Call `useSceneLoader(scenePath)` to get the validated `Scene` object (Suspense-compatible)
  2. Create a `resolvedMaterials` map via `useRef(new Map<string, THREE.MeshStandardNodeMaterial>())` — this is shared across all ObjectRenderers for material inheritance
  3. Render `<EnvironmentRenderer environment={scene.environment} />`
  4. Map over `scene.objects` and render `<ObjectRenderer key={obj.id} object={obj} resolvedMaterials={resolvedMaterials.current} />` for each
  5. Set up camera from `scene.camera`:
     - Use `useThree()` to access the camera
     - In a `useEffect`, set `camera.position.set(...scene.camera.position)`, `camera.fov = scene.camera.fov`, `camera.near = scene.camera.near`, `camera.far = scene.camera.far`, and call `camera.updateProjectionMatrix()`
     - Set `camera.lookAt(...scene.camera.target)` — but note this conflicts with OrbitControls, so instead set OrbitControls target
  6. Render `<OrbitControls target={scene.camera.target} />` from `@react-three/drei` so the camera orbits around the specified target
- [ ] This component is meant to be rendered INSIDE an R3F `<Canvas>`, not as a standalone. The parent component (the demo wrapper) provides the Canvas

**Important:** The component should NOT include a `<Canvas>` itself — it renders scene content that goes inside a Canvas. The demo component (Task 9) provides the Canvas wrapper, mirroring how existing demos work (see `src/components/Viewer.tsx` which wraps demos in Canvas).

**Acceptance criteria:** `<SceneFromYaml scenePath="/scenes/test-scene.scene.yaml" />` rendered inside a Canvas loads the YAML, sets up camera/lights/fog, and renders all objects with correct generators, materials, and transforms.

**Commit message:** `feat(renderer): add SceneFromYaml top-level component`

---

### Task 8: Public exports

**Files:** `src/pipeline/renderer/index.ts`

- [ ] Create `index.ts` that re-exports the public API:
  ```typescript
  export { default as SceneFromYaml } from './SceneFromYaml';
  export { useSceneLoader, fetchScene } from './scene-loader';
  export { default as ObjectRenderer } from './ObjectRenderer';
  export { default as EnvironmentRenderer } from './EnvironmentRenderer';
  export { useAnimations } from './animation';
  ```

**Commit message:** `feat(renderer): add public exports for renderer module`

---

### Task 9: Create test scene YAML

**Files:** `public/scenes/test-scene.scene.yaml`

- [ ] Create `public/scenes/` directory if it does not exist
- [ ] Create `test-scene.scene.yaml` with a scene proving the pipeline works end-to-end. The scene must include:
  1. **Meta:** name "Test Scene", technique "parametric + csg", description "Pipeline integration test with terrain, rocks, and CSG objects"
  2. **Camera:** position `[8, 6, 8]`, target `[0, 0, 0]`, fov `55`
  3. **Environment:**
     - Background: `#1a1a2e`
     - Fog: linear, color `#1a1a2e`, near `15`, far `40`
     - Ambient: color `#404060`, intensity `0.4`
     - Lights: one directional at `[5, 10, 5]`, intensity `1.2`, castShadow true; one point at `[-3, 4, -2]`, color `#ffaa44`, intensity `0.8`
  4. **Object 1 — Terrain** (parametric/terrain):
     - id: `ground`, prompt: `"rolling grassy hills"`, generator: `parametric/terrain`
     - params: `{ biome: grassland, width: 30, depth: 30, segments: 64, amplitude: 1.5 }`
     - transform: position `[0, -2, 0]`
     - material: preset `concrete-weathered`, pbr: `{ color: '#4a7c3f', roughness: 0.9 }`
     - receiveShadow: true, castShadow: false
  5. **Object 2 — Rock** (parametric/rock):
     - id: `boulder-1`, prompt: `"large weathered boulder"`, generator: `parametric/rock`
     - params: `{ variant: boulder, radius: 1.5, detail: 3 }`
     - transform: position `[3, -0.5, 1]`, rotation `[0, 25, 0]`
     - material: preset `rusted-metal`, pbr: `{ color: '#7a6b5a', roughness: 0.85, metalness: 0.1 }`
     - castShadow: true
  6. **Object 3 — CSG archway** (csg):
     - id: `archway`, prompt: `"stone archway"`, generator: `csg`
     - params: operations with a box (width 3, height 3, depth 0.5) minus a cylinder (radius 1, height 1) positioned to carve an arch
     - transform: position `[-2, 0, -1]`, rotation `[0, -15, 0]`
     - material: preset `concrete-weathered`
     - castShadow: true
  7. **Object 4 — Small rock with animation**:
     - id: `floating-rock`, prompt: `"small floating rock"`, generator: `parametric/rock`
     - params: `{ variant: jagged, radius: 0.4, detail: 2 }`
     - transform: position `[0, 2, 0]`
     - material: pbr: `{ color: '#555555', roughness: 0.7, metalness: 0.2, emissive: '#2244aa', emissive_intensity: 0.5 }`
     - animation: `[{ property: 'transform.position.y', type: 'sine', speed: 0.3, amplitude: 0.5 }, { property: 'transform.rotation.y', type: 'rotate', speed: 0.5, amplitude: 1 }]`

**Acceptance criteria:** The YAML file parses successfully via `parseSceneOrThrow()`. It exercises parametric/terrain, parametric/rock, and csg generators. It tests material presets, PBR overrides, animations, fog, and multiple light types.

**Commit message:** `feat(renderer): add test-scene.scene.yaml for pipeline integration testing`

---

### Task 10: Create demo wrapper component + register in demo registry

**Files:** `src/demos/test-scene/index.tsx`, `src/lib/registry.ts`

- [ ] Create `src/demos/test-scene/index.tsx`:
  ```typescript
  import SceneFromYaml from '../../pipeline/renderer/SceneFromYaml';

  export default function TestScene() {
    return <SceneFromYaml scenePath="/scenes/test-scene.scene.yaml" />;
  }
  ```
  This is intentionally minimal — the scene YAML is the source of truth, the demo component is a thin wrapper.

- [ ] Add the demo to `src/lib/registry.ts`:
  - Add a new entry to the `demos` array:
    ```typescript
    {
      name: 'test-scene',
      title: 'Test Scene (Pipeline)',
      description: 'Integration test: terrain, rocks, and CSG archway rendered from scene YAML',
      requiresWebGPU: false,
      color: '#66aa44',
      component: lazy(() => import('../demos/test-scene')),
    },
    ```
  - Add it at the end of the array (latest demos go last)

**Acceptance criteria:** Navigating to `/#test-scene` in the app renders the test scene demo. The Viewer component wraps it in a Canvas with WebGPURenderer. The demo appears in the gallery.

**Commit message:** `feat(renderer): add test-scene demo and register in gallery`

---

### Task 11: Integration test — build + dev + verify

**Files:** None (manual verification)

- [ ] Run `pnpm build` — verify no TypeScript errors, no build failures
- [ ] Run `pnpm dev` — open the browser to the local dev server
- [ ] Navigate to `/#test-scene` and verify:
  1. The scene loads without console errors (some warnings are acceptable)
  2. Terrain is visible as a displaced plane
  3. At least one rock object is visible
  4. The CSG archway is visible (a box with a cylindrical hole)
  5. The floating rock is animated (bobbing and rotating)
  6. Fog is visible (objects fade into the background at distance)
  7. Lighting is correct (directional shadow, warm point light)
  8. OrbitControls work (drag to rotate camera)
- [ ] Fix any issues found during verification. Common issues to watch for:
  - Generator type mismatch: ensure the spec `SceneObject` type is compatible with the generator `SceneObject` type — if not, add an adapter function
  - Material import paths: ensure resolver and presets are imported correctly
  - R3F `<primitive>` usage for InstancedMesh: ensure the `object` prop receives the mesh instance
  - Camera setup race condition with OrbitControls: ensure camera position is set before OrbitControls initializes
- [ ] If the build or render fails, fix the issues and commit the fixes as a separate commit with message `fix(renderer): [description of fix]`

**Acceptance criteria:** `pnpm build` succeeds. The test-scene demo renders all 4 objects with correct materials, transforms, and animation. The scene matches the YAML spec.

**Commit message:** `test(renderer): verify integration — build passes and test-scene renders`

---

## Error Handling Summary

These error handling behaviors are defined in the spec and must be implemented:

| Scenario | Behavior | Where |
|----------|----------|-------|
| Generator not found for object | Render magenta wireframe cube at object position | `generateObject()` in generator registry (already implemented) |
| Generator throws | Render magenta wireframe cube | `generateObject()` (already implemented) |
| Unknown material preset | Fall back to default grey `MeshStandardNodeMaterial`, log warning | `resolveMaterial()` (already implemented) |
| SDF object | Use generator-provided material, skip material resolver | `ObjectRenderer.tsx` |
| Invalid PBR values (out of range) | Clamp to [0, 1] | `resolveMaterial()` (already implemented) |
| YAML parse error | Throw descriptive error, show error in UI | `scene-loader.ts` |
| Fetch failure (404 etc.) | Throw error, Suspense error boundary can catch | `scene-loader.ts` |
| Unknown animation property | Silently ignore | `animation.ts` |
| Missing `id` or `prompt` | Zod validation rejects at parse time | `parseSceneOrThrow()` (already implemented) |

## Dependency Graph

```
Task 1 (scene-loader)          — no dependencies
Task 2 (EnvironmentRenderer)   — no dependencies
Task 3 (ObjectRenderer)        — no dependencies (uses existing generator/material modules)
Task 4 (instancing)            — depends on Task 3
Task 5 (animation system)      — no dependencies
Task 6 (animation integration) — depends on Task 3 + Task 5
Task 7 (SceneFromYaml)         — depends on Task 1 + Task 2 + Task 3
Task 8 (exports)               — depends on Task 7
Task 9 (test YAML)             — no code dependencies (YAML file)
Task 10 (demo + registry)      — depends on Task 7 + Task 8
Task 11 (integration test)     — depends on all above
```

**Parallelizable:** Tasks 1, 2, 3, 5, and 9 can all be implemented in parallel.
