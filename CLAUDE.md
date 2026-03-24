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

## Concept

Three.js now ships a WebGPURenderer that enables compute shaders, GPU-driven particles, TSL (Three Shading Language), and next-gen rendering features. This project creates a gallery of experiments — each one a standalone demo showcasing a different WebGPU capability.

Uses Choo Choo Ralph loops to generate demos in batches, each exploring:
- Compute shader particle systems
- GPU-driven geometry
- TSL custom materials
- Post-processing with compute
- Procedural terrain and environments

## Demo Structure

Each demo is a self-contained scene at /viewer#demo-name with:
- A WebGPURenderer canvas (falls back to WebGLRenderer if needed)
- Unique visual effect or technique
- Camera controls (orbit)
- A brief description overlay

## Documentation Hierarchy

Before implementing any feature, read docs in this order:

1. `docs/vision.md` — project vision, architecture, current state
2. `docs/prd/` — requirements and feature inventory (what to build and current status)
3. `docs/specs/` — technical design documents (how to build it)

**Governance chain**: Vision governs PRDs. PRDs govern specs. Specs govern implementation.
Do not contradict upstream docs. If a spec conflicts with a PRD, the PRD wins.

After implementing a feature:
- Update the PRD feature status (PLANNED -> COMPLETE)
- Update the spec status (APPROVED -> IMPLEMENTED)
