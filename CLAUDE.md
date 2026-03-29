# WebGPU Demos

Batch experiments showcasing Three.js WebGPURenderer — procedural scenes, compute shaders, and GPU-driven particle systems. Each demo explores a different WebGPU capability.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **3D Engine**: Three.js (WebGPURenderer), @react-three/fiber, @react-three/drei
- **Deploy**: Cloudflare Pages via GitHub Actions
- **Tooling**: pnpm, mise
- **Batch Creation**: Choo Choo Ralph loops for autonomous demo generation

## Commands

- `pnpm dev` — Start dev server
- `pnpm build` — Production build
- `pnpm preview` — Preview production build
- `pnpm test` — Run test suite (336 tests via Vitest)

## Concept

Three.js now ships a WebGPURenderer that enables compute shaders, GPU-driven particles, TSL (Three Shading Language), and next-gen rendering features. This project creates a gallery of experiments — each one a standalone demo showcasing a different WebGPU capability.

Uses Choo Choo Ralph loops to generate demos in batches across 12 themes:
- Compute shader particle systems
- GPU-driven geometry
- TSL custom materials
- Post-processing with compute
- Procedural terrain and environments
- Audio-reactive music visualizations
- Physics playgrounds (cloth, fluid, collision)
- Procedural worlds (terrain, cities, caves)
- Retro aesthetics (CRT, VHS, synthwave)
- Organic nature (growth, weather, ecosystems)
- Abstract math art (fractals, topology, attractors)
- Game-ready techniques (shadows, SSAO, PBR, culling)

## Demo Types

### Effect Demos (125)
Self-contained scenes at `/viewer#demo-name` showcasing individual WebGPU capabilities (TSL materials, compute shaders, SDF, emergent simulations, audio-reactive, physics, procedural worlds, retro aesthetics, organic nature, abstract math, game-ready techniques). Each is a single `index.tsx` in `src/demos/<name>/`.

### Scene Demos (11)
Rendered from YAML scene files via the model pipeline at `/viewer#demo-name`. Each is a thin wrapper calling `<SceneFromYaml scenePath="/scenes/<name>.scene.yaml" />`. Scene YAML files live in `public/scenes/`.

### Interactive Data Viz Demos (10)
Structured data rendered as interactive 3D scenes with click-to-navigate, camera transitions, Html overlays, and sidebar UI. Use simple property-based materials (no TSL Fn() overhead) for fast loading. Pattern: forge-lifecycle, architecture-blueprint, etc.

## Model Pipeline

AI-driven 3D model generation pipeline at `src/pipeline/`:

- **`spec/`** — YAML schema (Zod), parser, TypeScript types
- **`generators/`** — CSG, SDF, 10 parametric generators, codegen loader, Tripo stub
- **`materials/`** — 14 PBR presets, resolver (6-step resolution), shader compiler
- **`textures/`** — Procedural texture generators
- **`renderer/`** — SceneFromYaml, ObjectRenderer, EnvironmentRenderer, animation
- **`prefabs/`** — Prefab registry with GPU instancing
- **`lod/`** — Mesh simplification, auto 3-level LOD
- **`optimizer/`** — Mesh cleanup, material/geometry deduplication
- **`editor/`** — Read/write/modify scene YAML programmatically

**Extractable spec**: `docs/spec/scene-pipeline-spec-v1.md` (engine-agnostic)

## Documentation Hierarchy

Before implementing any feature, read docs in this order:

1. `docs/vision.md` — project vision, architecture, current state
2. `docs/prd/` — requirements and feature inventory (what to build and current status)
3. `docs/specs/` — technical design documents (how to build it)
4. `docs/ralph-specs/` — batch generation specs, playbooks, and accumulated learnings

**Governance chain**: Vision governs PRDs. PRDs govern specs. Specs govern implementation.
Do not contradict upstream docs. If a spec conflicts with a PRD, the PRD wins.

After implementing a feature:
- Update the PRD feature status (PLANNED -> COMPLETE)
- Update the spec status (APPROVED -> IMPLEMENTED)

Archived plans from earlier phases live in `docs/archive/` for reference.

## Key File Locations

| What | Where |
|------|-------|
| Demo registry | `src/lib/registry.ts` |
| Scene YAML files | `public/scenes/*.scene.yaml` |
| Pipeline spec (portable) | `docs/specs/scene-pipeline-spec-v1.md` |
| Model pipeline design | `docs/specs/model-pipeline-design.md` |
| Batch generation design | `docs/specs/batch-generation-design.md` |
| Ralph learnings | `docs/ralph-specs/learnings.md` |
| Scene editing spec | `docs/ralph-specs/scene-editing.md` |
| Zod schema (source of truth) | `src/pipeline/spec/schema.ts` |
| Material presets | `src/pipeline/materials/presets/` |
| Parametric generators | `src/pipeline/generators/parametric/` |
