# Batch Generation & REQ-11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-demo WebGPU compatibility blocking (REQ-11) and create a Choo Choo Ralph spec for autonomous batch demo generation with a learning loop.

**Architecture:** REQ-11 modifies the Viewer to block WebGPU-only demos on WebGL browsers, showing a static thumbnail + message instead of loading the demo component. The Ralph spec is a standalone markdown document that instructs an AI agent to generate 10 demos per batch, learning from each one.

**Tech Stack:** React 19, TypeScript, Three.js WebGPURenderer, @react-three/fiber, Vite, Choo Choo Ralph

**Spec:** `docs/superpowers/specs/2026-03-24-batch-generation-and-req11-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/Viewer.tsx` | MODIFY — Fix detection race condition, add `WebGPURequiredBlock` component |
| `src/components/Gallery.tsx` | MODIFY — Add "WebGPU" badge to cards |
| `src/App.css` | MODIFY — Add styles for blocking overlay and badge |
| `docs/ralph-specs/batch-demos.md` | CREATE — Choo Choo Ralph spec with inline template and learning loop |
| `docs/ralph-specs/learnings.md` | CREATE — Empty learnings file for Ralph to populate |

---

### Task 1: Fix WebGPU Detection Race Condition in Viewer

**Files:**
- Modify: `src/components/Viewer.tsx:86-92`

- [ ] **Step 1: Change `isWebGPU` state to nullable**

In `Viewer.tsx`, change the state initialization and add a loading gate:

```tsx
// Before (line 87):
const [isWebGPU, setIsWebGPU] = useState(true);

// After:
const [isWebGPU, setIsWebGPU] = useState<boolean | null>(null);
```

- [ ] **Step 2: Add loading state before the Canvas/blocking render**

After the `if (!demo)` check (line 108), add:

```tsx
if (isWebGPU === null) {
  return <LoadingSpinner />;
}
```

- [ ] **Step 3: Update the Overlay `isWebGPU` prop type**

The `OverlayProps` interface (line 29) needs to accept `boolean` (not `boolean | null`) since the Overlay only renders after detection. No change needed — the Overlay is only rendered inside the Canvas branch where `isWebGPU` is resolved. But update the conditional render so TypeScript is satisfied:

The Canvas + Overlay block should only render when `isWebGPU !== null && !(demo.requiresWebGPU && !isWebGPU)`. This is handled in Task 2.

- [ ] **Step 4: Verify the app still loads**

Run: `pnpm dev`
Open: `http://localhost:5173/#tsl-torus`
Expected: Demo loads and renders normally (all existing demos have `requiresWebGPU: false`)

- [ ] **Step 5: Commit**

```bash
git add src/components/Viewer.tsx
git commit -m "fix: resolve WebGPU detection race condition in Viewer

Change isWebGPU state default from true to null, show loading spinner
until async detection completes. Prevents briefly rendering Canvas
before knowing if WebGPU is available."
```

---

### Task 2: Add WebGPURequiredBlock Component to Viewer

**Files:**
- Modify: `src/components/Viewer.tsx`

- [ ] **Step 1: Create the `WebGPURequiredBlock` component**

Add this component inside `Viewer.tsx`, after the existing `LoadingSpinner` component (around line 25):

```tsx
interface WebGPURequiredBlockProps {
  demo: DemoEntry;
}

function WebGPURequiredBlock({ demo }: WebGPURequiredBlockProps) {
  const { prev, next } = getAdjacentDemos(demo.name);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prev) window.location.hash = prev.name;
      if (e.key === 'ArrowRight' && next) window.location.hash = next.name;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next]);

  return (
    <div className="webgpu-required-block">
      <img
        src={`/thumbnails/${demo.name}.jpg`}
        alt={demo.title}
        className="webgpu-required-bg"
      />
      <div className="webgpu-required-content">
        <h2>This demo requires WebGPU</h2>
        <p>{demo.title} — {demo.description}</p>
        <p className="webgpu-required-hint">
          Your browser doesn't support WebGPU. Try Chrome 113+ or Edge 113+.
        </p>
        <a href="/" className="back-button">← Back to Gallery</a>
      </div>
      <div className="webgpu-required-nav">
        {prev && (
          <a href={`#${prev.name}`} className="nav-button nav-prev">
            ‹ {prev.title}
          </a>
        )}
        {next && (
          <a href={`#${next.name}`} className="nav-button nav-next">
            {next.title} ›
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add conditional render in the Viewer component**

Replace the return block of the `Viewer` component (lines 114-129) with:

```tsx
return (
  <div className="viewer">
    {demo.requiresWebGPU && !isWebGPU ? (
      <WebGPURequiredBlock demo={demo} />
    ) : (
      <>
        <Suspense fallback={<LoadingSpinner />}>
          <Canvas
            className="viewer-canvas"
            camera={{ position: [0, 0, 4], fov: 70 }}
            gl={glCreator}
          >
            <DemoComponent />
            <OrbitControls enableDamping />
          </Canvas>
        </Suspense>
        <Overlay key={demo.name} demo={demo} isWebGPU={isWebGPU} />
      </>
    )}
  </div>
);
```

- [ ] **Step 3: Verify with a temporary test**

Temporarily change one demo in `registry.ts` to `requiresWebGPU: true` (e.g., `tsl-torus`). Open `http://localhost:5173/#tsl-torus`. Verify the blocking overlay appears with thumbnail, message, and nav buttons. Revert the registry change after.

- [ ] **Step 4: Commit**

```bash
git add src/components/Viewer.tsx
git commit -m "feat: add WebGPURequiredBlock component for REQ-11

WebGPU-only demos show a blocking overlay with thumbnail, message, and
navigation instead of attempting to render. Lazy component is not loaded
when blocked, avoiding WebGPU-only shader code on incompatible browsers."
```

---

### Task 3: Add Blocking Overlay and Badge Styles

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Add WebGPU blocking overlay styles**

Insert into `src/App.css` before line 217 (the `@media (max-width: 768px)` responsive block):

```css
/* WebGPU Required Block */
.webgpu-required-block {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #000;
}

.webgpu-required-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.2;
  filter: blur(8px);
  pointer-events: none;
}

.webgpu-required-content {
  position: relative;
  text-align: center;
  max-width: 500px;
  padding: 2rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
}

.webgpu-required-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.webgpu-required-content p {
  font-size: 0.9rem;
  color: #aaa;
  line-height: 1.5;
}

.webgpu-required-hint {
  margin-top: 0.75rem;
  color: #f0ad4e !important;
  font-style: italic;
}

.webgpu-required-content .back-button {
  display: inline-block;
  margin-top: 1.25rem;
}

.webgpu-required-nav {
  position: fixed;
  bottom: 1.5rem;
  left: 1.5rem;
  right: 1.5rem;
  display: flex;
  justify-content: space-between;
}

/* WebGPU Badge (Gallery) */
.webgpu-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: var(--accent);
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  backdrop-filter: blur(4px);
}
```

- [ ] **Step 2: Verify styles render correctly**

Open `http://localhost:5173` and check that the gallery looks normal (no badges on existing demos since all are `requiresWebGPU: false`).

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "style: add WebGPU blocking overlay and gallery badge styles"
```

---

### Task 4: Add WebGPU Badge to Gallery Cards

**Files:**
- Modify: `src/components/Gallery.tsx`

- [ ] **Step 1: Add the badge to demo cards**

In `Gallery.tsx`, inside the `.demo-card-preview` div (after the `<img>` tag), add:

```tsx
{demo.requiresWebGPU && (
  <span className="webgpu-badge">WebGPU</span>
)}
```

The full card preview div becomes:

```tsx
<div className="demo-card-preview">
  <img
    src={`/thumbnails/${demo.name}.jpg`}
    alt={demo.title}
    className="demo-card-thumb"
    loading="lazy"
  />
  {demo.requiresWebGPU && (
    <span className="webgpu-badge">WebGPU</span>
  )}
</div>
```

- [ ] **Step 2: Verify badge appears**

Temporarily set one demo to `requiresWebGPU: true` in `registry.ts`. Open `http://localhost:5173`. Verify the badge appears in the top-right corner of that demo's card. Revert after.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Gallery.tsx
git commit -m "feat: add WebGPU badge to gallery cards for REQ-11

Cards for demos with requiresWebGPU: true show a small 'WebGPU' pill
badge in the preview area so users know before clicking."
```

---

### Task 5: Create the Choo Choo Ralph Batch Demos Spec

**Files:**
- Create: `docs/ralph-specs/batch-demos.md`

- [ ] **Step 1: Create the ralph-specs directory**

```bash
mkdir -p docs/ralph-specs
```

- [ ] **Step 2: Write the Ralph spec**

Create `docs/ralph-specs/batch-demos.md` with the following content. Note: the two inline template code blocks contain the COMPLETE source of existing demos for Ralph to follow as reference implementations.

````markdown
# Batch Demo Generation — Choo Choo Ralph Spec

## Goal

Generate 10 new WebGPU demos per batch, each targeting an unexplored WebGPU/TSL capability. Learn from each demo to improve subsequent ones.

## Prerequisites

- `pnpm dev` must be running before the per-demo verify loop
- Read `docs/ralph-specs/learnings.md` before starting (skip patterns listed as broken, prefer patterns listed as working)

## Existing Demos (15)

| # | Name | Features Used |
|---|------|--------------|
| 1 | tsl-torus | TSL color, oscSine, fresnel (normalWorld.dot), positionNode displacement |
| 2 | particle-field | InstancedMesh (2000), position-driven color, fresnel emissive, mix() |
| 3 | procedural-terrain | Plane displacement via TSL Fn(), height-based coloring, multi-layer sine |
| 4 | crystal-grid | Instanced icosahedrons, rainbow wave (time + position), metalness/roughness |
| 5 | aurora-waves | Additive blending, translucent ribbons, flowing multi-color |
| 6 | morphing-sphere | Sine-wave vertex displacement, organic blob |
| 7 | neon-rings | Concentric torus, pulsing emissive glow |
| 8 | ocean-surface | Layered wave displacement, glossy/reflective surface |
| 9 | pulse-grid | 400 instanced boxes, expanding circular ripple |
| 10 | spiral-galaxy | 3000 instanced stars, spiral arm positioning |
| 11 | flame-orb | Aggressive flickering, warm emission |
| 12 | dna-helix | Double helix instanced spheres, connecting rungs |
| 13 | wireframe-landscape | Wireframe material, scrolling terrain, neon glow |
| 14 | plasma-globe | Swirling discharge patterns, purple-blue |
| 15 | ribbon-dance | Twisted ribbon geometry, multi-color spiraling |

### Existing Accent Colors (avoid duplicates)
`#0088ff`, `#ff44aa`, `#1a9926`, `#8844ff`, `#00ff88`, `#ff6600`, `#ff00ff`, `#0066cc`, `#1144aa`, `#ffcc44`, `#ff3300`, `#4488ff`, `#00ffff`, `#6600ff`, `#ff2244`

## Concept Generation

Analyze the existing demos above. Identify WebGPU/TSL capabilities NOT yet covered:

**Target capabilities (pick 10):**
- Compute shaders (`storageBuffer`, `computeFn`) — set `requiresWebGPU: true`
- Storage textures — set `requiresWebGPU: true`
- Advanced TSL noise functions (`hash`, `mx_noise_float`, `checker`)
- TSL texture projection / UV manipulation
- Bloom/glow post-processing via TSL
- GPU-driven geometry (buffer geometry from compute)
- Skinned mesh with TSL node overrides
- Multi-material objects (different TSL materials per face group)
- TSL `screenUV` / screen-space effects
- Volumetric/raymarching effects via TSL `Fn()`
- Sprite/billboard particles with TSL
- TSL `viewportSize` / resolution-dependent effects

Generate 10 concepts, each targeting a different capability from this list. Name each demo with a kebab-case slug (e.g., `compute-particles`, `noise-terrain`).

## Reference Template: Simple Demo (~60 lines)

This is the complete source of `src/demos/tsl-torus/index.tsx`:

```tsx
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
} from 'three/tsl';

export default function TslTorus() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Animated blue color
    mat.colorNode = color(0x0088ff).mul(
      oscSine(time.mul(0.5)).mul(0.5).add(0.5),
    );

    // Fresnel rim glow
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });
    mat.emissiveNode = color(0x00ffff).mul(fresnel());

    // Subtle vertex displacement
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(2.0).add(positionLocal.y)).mul(0.03)),
    );

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <mesh ref={meshRef} material={material}>
        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
      </mesh>
    </>
  );
}
```

## Reference Template: Complex Demo (~150 lines)

This is the complete source of `src/demos/particle-field/index.tsx`:

```tsx
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
  mix,
} from 'three/tsl';

const PARTICLE_COUNT = 2000;
const GRID_SIZE = 13;
const SPREAD = 6;

export default function ParticleField() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];
    let count = 0;

    for (let ix = 0; ix < GRID_SIZE && count < PARTICLE_COUNT; ix++) {
      for (let iy = 0; iy < GRID_SIZE && count < PARTICLE_COUNT; iy++) {
        for (let iz = 0; iz < GRID_SIZE && count < PARTICLE_COUNT; iz++) {
          const x =
            ((ix / (GRID_SIZE - 1)) - 0.5) * SPREAD +
            (Math.random() - 0.5) * 0.3;
          const y =
            ((iy / (GRID_SIZE - 1)) - 0.5) * SPREAD +
            (Math.random() - 0.5) * 0.3;
          const z =
            ((iz / (GRID_SIZE - 1)) - 0.5) * SPREAD +
            (Math.random() - 0.5) * 0.3;

          const scale = 0.03 + Math.random() * 0.04;

          dummy.position.set(x, y, z);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          result.push(dummy.matrix.clone());
          count++;
        }
      }
    }

    return result;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const posW = positionWorld;
    const t = time.mul(0.3);

    const r = oscSine(posW.x.mul(0.8).add(t)).mul(0.5).add(0.5);
    const g = oscSine(posW.y.mul(0.8).add(t.mul(1.3))).mul(0.5).add(0.5);
    const b = oscSine(posW.z.mul(0.8).add(t.mul(0.7))).mul(0.5).add(0.5);

    const base = color(0x00ccff);
    const gradientFactor = float(1.0)
      .sub(r.mul(0.3))
      .add(g.mul(0.5))
      .add(b.mul(0.2));
    const gradient = color(0xffffff).mul(gradientFactor);
    const blendFactor = oscSine(t.mul(0.5)).mul(0.5).add(0.5);
    mat.colorNode = mix(base, gradient, blendFactor);

    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    const emissiveColor = Fn(() => {
      const magenta = color(0xff00ff);
      const cyan = color(0x00ffff);
      const blend = oscSine(time.mul(0.2)).mul(0.5).add(0.5);
      return mix(magenta, cyan, blend);
    });

    mat.emissiveNode = emissiveColor().mul(fresnel()).mul(float(1.5));

    mat.positionNode = positionLocal.add(
      normalLocal.mul(
        oscSine(time.mul(1.5).add(positionLocal.y.mul(4.0))).mul(0.015),
      ),
    );

    mat.roughness = 0.4;
    mat.metalness = 0.6;

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
      groupRef.current.rotation.x += delta * 0.03;
    }
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[8, 10, 5]} intensity={1.2} color={0xffffff} />
      <directionalLight position={[-5, -3, -8]} intensity={0.4} color={0x8888ff} />
      <pointLight position={[0, 0, 0]} intensity={2} color={0x00ffff} distance={12} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
        >
          <sphereGeometry args={[1, 8, 6]} />
        </instancedMesh>
      </group>
    </>
  );
}
```

## Registry Entry Pattern

Each new demo needs an entry appended to the `demos` array in `src/lib/registry.ts`:

```tsx
{
  name: '<kebab-case-name>',
  title: '<Human Readable Title>',
  description: '<One-line description of the visual effect>',
  requiresWebGPU: false, // true only for compute shaders or storage buffers
  color: '<hex accent color, distinct from existing colors>',
  component: lazy(() => import('../demos/<kebab-case-name>')),
},
```

## Per-Demo Task Loop

For each of the 10 concepts:

### 1. Create the demo file
Create `src/demos/<name>/index.tsx` following the reference templates above:
- Single default export React component
- Import from `'three/webgpu'` and `'three/tsl'`
- Material built in `useMemo()` with `MeshStandardNodeMaterial`
- Animation via `useFrame()`
- Self-contained (no shared state, no external dependencies beyond Three.js/R3F)

### 2. Register in registry
Append entry to `src/lib/registry.ts` with all fields. Choose a distinct accent color.

### 3. Verify build
Run: `pnpm build`
Must compile with zero errors. If it fails, go to Quality Gate.

### 4. Verify render
Open `http://localhost:5173/#<name>` in a browser (Playwright).
Take a screenshot. Confirm it is NOT:
- A black screen
- An error message
- A blank white page
If it fails, go to Quality Gate.

### 5. Generate thumbnail
Capture a screenshot of the running demo and save to `public/thumbnails/<name>.jpg` (served by Vite as `/thumbnails/<name>.jpg`).

### 6. Update learnings
After each demo (success or failure), update `docs/ralph-specs/learnings.md`:

**Record under "Working Patterns":**
- Which TSL nodes/APIs rendered correctly
- Which parameter ranges produced good visuals
- Effective color/animation combinations

**Record under "Broken Patterns":**
- APIs that threw errors (with the error message)
- TSL nodes that didn't work as expected
- Three.js WebGPU features that aren't ready in v0.183

**Record under "Visual Quality Notes":**
- What made a demo visually striking vs. bland
- Animation speed sweet spots
- Lighting configurations that worked well

### 7. Read learnings before next demo
Before starting the next demo, re-read `docs/ralph-specs/learnings.md`. Avoid broken patterns. Build on working patterns. Apply visual quality insights.

## Quality Gate

If a demo fails build or renders incorrectly:

- **Attempt 1**: Fix based on the error message
- **Attempt 2**: Simplify — fall back to the simple demo template (tsl-torus pattern) using the same concept's title and color, using ONLY TSL nodes listed as "Working" in the learnings file
- **If still failing**: Skip this demo. Record the failure (concept name, error, root cause) in learnings under "Broken Patterns". Move to the next concept. Do NOT spend more than 2 attempts.

## Batch Summary

After all 10 concepts are attempted, output:

```
## Batch N Summary (YYYY-MM-DD)

### Created (X/10)
| Name | Title | requiresWebGPU | Color |
|------|-------|---------------|-------|
| ... | ... | ... | ... |

### Skipped (Y/10)
| Name | Reason |
|------|--------|
| ... | ... |

### Key Learnings
- ...

### Total Demo Count: {existing + new}
```

Also append this summary to `docs/ralph-specs/learnings.md` under "Batch History".
````

- [ ] **Step 3: Commit**

```bash
git add docs/ralph-specs/batch-demos.md
git commit -m "feat: add Choo Choo Ralph spec for batch demo generation

Includes inline demo templates, concept generation instructions,
per-demo task loop with build/render verification, learning loop
that accumulates patterns across batches, and quality gates."
```

---

### Task 6: Create the Learnings File

**Files:**
- Create: `docs/ralph-specs/learnings.md`

- [ ] **Step 1: Create the empty learnings file**

Create `docs/ralph-specs/learnings.md`:

```markdown
# Batch Demo Learnings

## Last updated: 2026-03-24

## Working Patterns

_No entries yet. Ralph will populate this after the first batch._

## Broken Patterns

_No entries yet._

## Visual Quality Notes

_No entries yet._

## Batch History

_No batches run yet._
```

- [ ] **Step 2: Commit**

```bash
git add docs/ralph-specs/learnings.md
git commit -m "feat: add empty learnings file for Ralph batch generation

Initialized with section headers. Ralph populates this after each demo
in a batch, accumulating knowledge across runs."
```

---

### Task 7: Update PRD Status

**Files:**
- Modify: `docs/prd/prd.md`

- [ ] **Step 1: Update REQ-11 status**

Change REQ-11 from `PLANNED` to `COMPLETE`:

```markdown
- [x] **REQ-11**: Per-demo compatibility `COMPLETE`
  - AC: Demos that require compute shaders show "Requires WebGPU" when running in WebGL mode
```

- [ ] **Step 2: Update Feature 5 status**

Change Feature 5 from `PLANNED` to `PARTIAL`:

```markdown
| 5 | Batch generation | PARTIAL | | Choo Choo Ralph spec created, learnings file ready, first batch not yet run |
```

- [ ] **Step 3: Commit**

```bash
git add docs/prd/prd.md
git commit -m "docs: update PRD status for REQ-11 (COMPLETE) and Feature 5 (PARTIAL)"
```

---

## Task Dependency Order

```
Task 1 (fix race condition)
  └→ Task 2 (WebGPURequiredBlock component)
       └→ Task 3 (CSS styles) + Task 4 (Gallery badge)  [parallel]
            └→ Task 5 (Ralph spec) + Task 6 (learnings file)  [parallel]
                 └→ Task 7 (PRD update)
```

Tasks 3 & 4 can run in parallel (note: Task 4's visual verification will show an unstyled badge if Task 3's CSS hasn't been applied yet — the build will still pass). Tasks 5 & 6 can run in parallel.
