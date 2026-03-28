---
title: WebGPU Demos Product Requirements
status: ACTIVE
last_updated: 2026-03-28
---

# WebGPU Demos — Product Requirements

## Executive Summary

A gallery of 76 WebGPU experiments built with Three.js WebGPURenderer. Each demo is a self-contained scene showcasing WebGPU capabilities — compute shaders, TSL materials, GPU particles, procedural worlds, emergent simulations, and interactive data visualizations. Five batch generation cycles complete, plus a scene pipeline for YAML-driven demos. CI deploys to Cloudflare Pages.

## Feature Inventory

| # | Feature | Status | Prove-First | Notes |
|---|---------|--------|-------------|-------|
| 1 | Demo viewer | COMPLETE | PROVEN | WebGPURenderer + R3F Canvas, orbit controls, hash routing, overlay |
| 2 | Demo gallery | COMPLETE | | Responsive grid with accent-colored cards, scrollable |
| 3 | WebGPU detection | COMPLETE | | Auto-fallback to WebGL with notice banner |
| 4 | Demo templates | COMPLETE | | 76 demos across 5 batches + scene pipeline demos |
| 5 | Batch generation | COMPLETE | | 5 batches run, Ralph spec + learnings file mature |
| 6 | Extractable scene spec | COMPLETE | | Engine-agnostic YAML scene pipeline spec v1.0 |
| 7 | Model pipeline | COMPLETE | | Scene spec, 5 generator tiers, 14 material presets, prefabs, LOD, optimizer, editor |
| 8 | Scene demos | COMPLETE | | 11 scene-based demos rendered from YAML via SceneFromYaml pipeline |
| 9 | Emergent systems (Batch 4) | COMPLETE | | 10 demos: boids, reaction-diffusion, cellular automata, terrain erosion, gravitational orbits, etc. |
| 10 | Interactive data viz (Batch 5) | COMPLETE | | 10 demos: forge-lifecycle, architecture-blueprint, decision-forest, neural-pipeline, state-machine, etc. |
| 11 | Interactive UI overlays | COMPLETE | | Instructions panel + clickable sidebar on all data viz demos |

## Active Requirements

### 1. Demo Viewer (PROVE FIRST)

Full-screen Three.js scene at `/viewer#demo-name` with WebGPURenderer and orbit controls.

- [x] **REQ-01**: Render a Three.js scene using WebGPURenderer inside an R3F `<Canvas>` `COMPLETE`
  - AC: Canvas fills the viewport, renders a test scene (TSL torus knot)
  - AC: Uses `WebGPURenderer` via R3F's async `gl` prop
- [x] **REQ-02**: Orbit controls for camera navigation `COMPLETE`
  - AC: User can rotate, zoom, and pan the camera via mouse/touch
  - AC: Uses drei's `<OrbitControls enableDamping />`
- [x] **REQ-03**: Load demo by hash route `COMPLETE`
  - AC: `#tsl-torus` loads the tsl-torus demo component
  - AC: Unknown hash shows a "demo not found" message
- [x] **REQ-04**: Description overlay `COMPLETE`
  - AC: Semi-transparent overlay shows demo title and 1-line description
  - AC: Overlay auto-hides after 3 seconds, reappears on hover
- [x] **REQ-05**: Back-to-gallery navigation `COMPLETE`
  - AC: Back button returns to `/` (gallery)

### 2. Demo Gallery

Grid of demo thumbnails on the homepage. Click to enter a demo.

- [x] **REQ-06**: Grid layout of demo cards `COMPLETE`
  - AC: Responsive grid — auto-fill 300px columns, 1 column on mobile
  - AC: Each card shows accent glow, title, and 1-line description
- [x] **REQ-07**: Click card to navigate to viewer `COMPLETE`
  - AC: Clicking a card navigates to `#demo-name`
- [x] **REQ-08**: Demo registry `COMPLETE`
  - AC: `src/lib/registry.ts` exports all demos with metadata (name, title, description, component)
  - AC: Gallery and viewer both consume this registry

### 3. WebGPU Detection

Detect WebGPU support and gracefully fall back to WebGL.

- [x] **REQ-09**: Feature detection on load `COMPLETE`
  - AC: Checks `navigator.gpu` and requests adapter
- [x] **REQ-10**: WebGL fallback `COMPLETE`
  - AC: If WebGPU unavailable, renders with `WebGLRenderer` instead
  - AC: Shows non-intrusive banner: "Running in WebGL mode — some effects may differ"
- [x] **REQ-11**: Per-demo compatibility `COMPLETE`
  - AC: Demos that require compute shaders show "Requires WebGPU" when running in WebGL mode

### 9. Emergent Systems — Batch 4 (2026-03-28)

10 demos exploring simulation, emergent behavior, and advanced compute:

- [x] **REQ-12**: GPU compute simulations (reaction-diffusion, cellular-life, terrain-erosion) `COMPLETE`
- [x] **REQ-13**: Flocking/N-body (boids-murmuration, gravitational-orbits) `COMPLETE`
- [x] **REQ-14**: Pure TSL effects (interference-waves, voronoi-shatter, sdf-morphscape) `COMPLETE`
- [x] **REQ-15**: Physics visualization (pendulum-wave, smoke-tendrils) `COMPLETE`

### 10. Interactive Data Visualization — Batch 5 (2026-03-28)

10 demos rendering structured data as interactive 3D scenes — first demos with click handling:

- [x] **REQ-16**: Click-to-navigate interactivity (onClick, onPointerOver mesh events) `COMPLETE`
- [x] **REQ-17**: Smooth camera transitions (camera.position.lerp in useFrame) `COMPLETE`
- [x] **REQ-18**: drei Html overlays for labels and UI panels `COMPLETE`
- [x] **REQ-19**: Structured data → 3D layout (graphs, trees, pipelines, timelines, terrain) `COMPLETE`
- [x] **REQ-20**: Instructions + sidebar UI on all data viz demos `COMPLETE`
- [x] **REQ-21**: Customer request trace animation (architecture-blueprint) `COMPLETE`

**Demos**: forge-lifecycle, decision-forest, dependency-graph-3d, code-constellation, neural-pipeline-flow, data-flow-pipes, state-machine-3d, architecture-blueprint, timeline-helix, metric-terrain

### 11. Performance Optimization (2026-03-28)

- [x] **REQ-22**: Simple property-based materials for data viz demos (no TSL Fn() overhead) `COMPLETE`
  - AC: Data viz demos use .color/.emissive/.emissiveIntensity — zero shader compilation
  - Learning: TSL complexity is for shader art demos, not data viz. Halos on every node kill performance.

## Intent Backlog

- **Thumbnails/screenshots**: Auto-capture preview images for gallery cards
- **Search/filter**: Tag-based filtering in gallery (by technique: TSL, compute, interactive, etc.)
- **Per-demo parameter controls**: Sliders for speed, color, density in shader demos
- **Performance dashboard**: FPS/GPU timing overlay comparing WebGPU vs WebGL

## Technical Reference

### Key Files
- `src/main.tsx` — React entry point
- `src/webgpu-setup.ts` — R3F WebGPU extension setup
- `src/App.tsx` — Hash router (gallery vs viewer)
- `src/components/Viewer.tsx` — WebGPU/WebGL canvas + controls + overlay
- `src/components/Gallery.tsx` — Responsive demo card grid
- `src/lib/webgpu-detect.ts` — Feature detection utility
- `src/lib/registry.ts` — Demo registry (name, component, metadata, color)
- `src/demos/<name>/index.tsx` — Individual demo scenes

### Pages
- `/` — Gallery grid (homepage)
- `/viewer#<demo-name>` — Full-screen demo viewer
