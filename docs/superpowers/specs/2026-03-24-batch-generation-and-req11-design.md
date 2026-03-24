---
title: Batch Demo Generation & Per-Demo WebGPU Compatibility
status: APPROVED
created: 2026-03-24
features: [Feature 5 - Batch Generation, REQ-11 - Per-Demo Compatibility]
---

# Batch Demo Generation & Per-Demo WebGPU Compatibility

## Overview

Two related features:
1. **REQ-11**: Block WebGPU-only demos in WebGL fallback mode with a clear message
2. **Feature 5**: Choo Choo Ralph spec for autonomous batch demo generation (10 demos per run) with a learning loop that improves quality across batches

## Feature 1: REQ-11 — Per-Demo Compatibility

### Current State

- `DemoMeta.requiresWebGPU: boolean` exists in the registry schema
- All 15 demos currently have `requiresWebGPU: false`
- Viewer shows a yellow "Running in WebGL mode" notice but renders all demos regardless

### Design

**Detection race condition**: The current `Viewer.tsx` defaults `isWebGPU` to `true` and resolves it asynchronously. For `requiresWebGPU: true` demos, this would briefly render the Canvas before detection completes, potentially loading WebGPU-only shader code that errors on WebGL browsers. Fix: change `useState(true)` to `useState<boolean | null>(null)`. When `isWebGPU === null`, show the `LoadingSpinner`. The blocking overlay or Canvas renders only after detection resolves.

When `demo.requiresWebGPU === true && isWebGPU === false`:

**Viewer.tsx** — render a `WebGPURequiredBlock` component instead of the Canvas:
- Show the demo's static thumbnail (`/thumbnails/{name}.jpg`) as background
- Centered message: "This demo requires WebGPU"
- Subtitle: "Your browser doesn't support WebGPU. Try Chrome 113+ or Edge 113+"
- "Back to Gallery" link
- **Includes its own prev/next navigation buttons and keyboard listener** (the `Overlay` component won't render since the Canvas is not mounted, so `WebGPURequiredBlock` must be self-contained with nav)
- **The demo's lazy component is NOT imported/loaded** — the conditional check happens before `<Suspense>/<Canvas>`, so no WebGPU-only code is downloaded or evaluated

**Gallery.tsx** — add a small badge on cards where `requiresWebGPU: true`:
- Small "WebGPU" pill badge in the top-right corner of the card preview
- Uses the demo's accent color
- Visible without hover, subtle enough not to dominate

**App.css** — new styles:
- `.webgpu-required-block` — full-viewport blocking overlay with thumbnail background
- `.webgpu-badge` — small pill badge for gallery cards

### Files Changed

| File | Change |
|------|--------|
| `src/components/Viewer.tsx` | Change `isWebGPU` default to `null`, add loading state, add `WebGPURequiredBlock` component with self-contained nav, conditional render before Canvas |
| `src/components/Gallery.tsx` | Add badge to cards with `requiresWebGPU: true` |
| `src/App.css` | Styles for blocking overlay and badge |

## Feature 2: Batch Demo Generation — Choo Choo Ralph Spec

### Concept

A Choo Choo Ralph spec that autonomously generates 10 new demos per batch. Ralph:
1. Analyzes existing demos to identify unexplored WebGPU/TSL capabilities
2. Generates novel concepts targeting those gaps
3. Implements each demo end-to-end (code, registry, thumbnail)
4. Learns from each demo to improve subsequent ones

### Ralph Spec Structure

The spec lives at `docs/ralph-specs/batch-demos.md` and contains:

#### 1. Context Section
- List of all existing demos and what WebGPU features they cover
- Reference to the demo template pattern (inline)
- Reference to the learnings file

#### 2. Demo Template Pattern (Inline)

Two reference demos are embedded in the spec:

**Simple demo** (tsl-torus pattern — ~60 lines):
```
- Single mesh with TSL node material
- useRef + useFrame for animation
- Imports from 'three/webgpu' and 'three/tsl'
- Material built in useMemo with MeshStandardNodeMaterial
- colorNode, emissiveNode, positionNode for visual effects
- Lighting: ambient + directional
```

**Complex demo** (particle-field pattern — ~150 lines):
```
- InstancedMesh with thousands of instances
- Matrix setup in useMemo, applied in useEffect
- TSL material with multiple computed nodes
- Group-level rotation in useFrame
- Multiple light sources
```

#### 3. Concept Generation Phase

Ralph must analyze:
- What TSL nodes/features are already used across existing demos
- What WebGPU capabilities are NOT yet covered (target list):
  - Compute shaders (storageBuffer, computeFn)
  - Storage textures
  - Render bundles
  - Indirect drawing
  - GPU-driven culling
  - Texture compute (image processing)
  - Advanced TSL nodes not yet used (hash, checkerboard, texture projection, noise functions)
  - Multi-pass rendering
  - Custom post-processing via compute
  - Skinned mesh with TSL
- Generate 10 concepts, each targeting a different unexplored capability
- Set `requiresWebGPU: true` for demos using compute shaders or storage buffers

#### 4. Per-Demo Task Loop

**Prerequisites**: Start the dev server (`pnpm dev`) before the per-demo loop. Stop it after the batch completes.

For each of the 10 concepts:

1. **Create** `src/demos/<name>/index.tsx`
   - Follow the inline template pattern
   - Single default export component
   - TSL node materials with `MeshStandardNodeMaterial`
   - Animation via `useFrame`
   - Self-contained (no shared state)

2. **Register** in `src/lib/registry.ts`
   - Append a new entry with: name, title, description, requiresWebGPU, color, lazy import
   - Choose a distinct accent color (avoid duplicating existing colors)

3. **Verify build**: Run `pnpm build` — must compile without errors

4. **Verify render**: Open `http://localhost:5173/#<name>` in browser (Playwright), take a screenshot, confirm it's not a black screen or error

5. **Generate thumbnail**: Capture screenshot and save to `public/thumbnails/<name>.jpg` (served by Vite as `/thumbnails/<name>.jpg`)

#### 5. Learning Loop (Critical)

After each demo, Ralph updates `docs/ralph-specs/learnings.md`:

**What to record:**
- **Working patterns**: TSL nodes that rendered correctly, API combinations that produced good visuals, effective parameter ranges
- **Broken patterns**: APIs that threw errors, TSL nodes that didn't work as expected, Three.js WebGPU features that aren't ready yet
- **Visual quality notes**: What made a demo visually striking vs. bland, effective color combinations, animation speeds that looked good

**How learnings feed forward:**
- Before starting each subsequent demo, Ralph reads the current learnings
- Avoids APIs/patterns listed as broken
- Builds on techniques listed as working
- Applies visual quality insights

**Learnings file structure:**
```markdown
# Batch Demo Learnings

## Last updated: {date}

## Working Patterns
- {pattern}: {why it works}

## Broken Patterns
- {pattern}: {error or issue}

## Visual Quality Notes
- {insight}

## Batch History
### Batch 1 ({date})
- Created: {list of demos}
- Skipped: {list with reasons}
- Key learning: {summary}
```

#### 6. Quality Gate

If a demo fails build or renders a black/error screen:
- Attempt 1: Fix the error based on the error message
- Attempt 2: Simplify — fall back to the simple demo template (tsl-torus pattern) with the same concept's color scheme and title, using only proven TSL nodes from the learnings file
- If still failing: skip the demo, record the failure and root cause in learnings, move to next concept
- Do not spend more than 2 attempts per demo

#### 7. Batch Summary

At the end of a Ralph run, output:
- List of demos created (name, title, requiresWebGPU)
- List of demos skipped (name, reason)
- Updated learnings file
- Total demo count (existing + new)

### Files Created/Modified

| File | Change |
|------|--------|
| `docs/ralph-specs/batch-demos.md` | NEW — Choo Choo Ralph spec |
| `docs/ralph-specs/learnings.md` | NEW — Accumulated learnings (empty initially) |
| `src/demos/<name>/index.tsx` | NEW x10 — Generated demo scenes |
| `src/lib/registry.ts` | MODIFIED — 10 new entries appended |
| `public/thumbnails/<name>.jpg` | NEW x10 — Generated thumbnails |

## Integration Between Features

REQ-11 and batch generation are connected:
- Ralph sets `requiresWebGPU: true` on demos using compute shaders or WebGPU-only features
- The Viewer's blocking overlay (REQ-11) handles these demos gracefully
- REQ-11 must be implemented BEFORE running the first Ralph batch, so that WebGPU-only demos display correctly from the start

## Implementation Order

1. REQ-11 (Viewer blocking overlay + Gallery badge)
2. Ralph spec file (`docs/ralph-specs/batch-demos.md`)
3. Learnings file (`docs/ralph-specs/learnings.md`)
4. Run first Ralph batch

## Success Criteria

- WebGPU-only demos show a clear blocking message on WebGL browsers
- Gallery cards show a "WebGPU" badge for those demos
- Ralph spec produces 10 compilable, visually distinct demos per batch
- Learnings file grows with each batch and improves subsequent demo quality
- No regressions to existing 15 demos
