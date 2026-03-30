---
title: ThreeForge Product Requirements
status: ACTIVE
last_updated: 2026-03-28
---

# ThreeForge — Product Requirements

## Executive Summary

A gallery of 146 WebGPU experiments built with Three.js WebGPURenderer. Each demo is a self-contained scene showcasing WebGPU capabilities — compute shaders, TSL materials, GPU particles, procedural worlds, emergent simulations, interactive data visualizations, audio-reactive music, physics playgrounds, retro aesthetics, organic nature, abstract math art, and game-ready rendering techniques. Twelve batch generation cycles complete, plus a scene pipeline for YAML-driven demos. CI deploys to Cloudflare Pages.

## Feature Inventory

| # | Feature | Status | Prove-First | Notes |
|---|---------|--------|-------------|-------|
| 1 | Demo viewer | COMPLETE | PROVEN | WebGPURenderer + R3F Canvas, orbit controls, hash routing, overlay |
| 2 | Demo gallery | COMPLETE | | Responsive grid with accent-colored cards, scrollable |
| 3 | WebGPU detection | COMPLETE | | Auto-fallback to WebGL with notice banner |
| 4 | Demo templates | COMPLETE | | 146 demos across 12 batches + scene pipeline demos |
| 5 | Batch generation | COMPLETE | | 12 batches run, Ralph spec + learnings file mature |
| 6 | Extractable scene spec | COMPLETE | | Engine-agnostic YAML scene pipeline spec v1.0 |
| 7 | Model pipeline | COMPLETE | | Scene spec, 5 generator tiers, 14 material presets, prefabs, LOD, optimizer, editor |
| 8 | Scene demos | COMPLETE | | 11 scene-based demos rendered from YAML via SceneFromYaml pipeline |
| 9 | Emergent systems (Batch 4) | COMPLETE | | 10 demos: boids, reaction-diffusion, cellular automata, terrain erosion, gravitational orbits, etc. |
| 10 | Interactive data viz (Batch 5) | COMPLETE | | 10 demos: forge-lifecycle, architecture-blueprint, decision-forest, neural-pipeline, state-machine, etc. |
| 11 | Interactive UI overlays | COMPLETE | | Instructions panel + clickable sidebar on all data viz demos |
| 12 | Audio-reactive demos (Batch 6) | COMPLETE | | 10 demos: beat-pulse-grid, frequency-mountains, waveform-tunnel, synth-aurora, drum-machine-cubes, bass-nebula, vinyl-grooves, equalizer-city, piano-waterfall, sonic-bloom |
| 13 | Physics playground demos (Batch 7) | COMPLETE | | 10 demos: cloth-wind, soft-body-bounce, rope-bridge, fluid-pressure, ragdoll-fall, spring-mesh, magnetic-fields, collision-cascade, elastic-waves, pendulum-chaos |
| 14 | Procedural worlds demos (Batch 8) | COMPLETE | | 10 demos: infinite-terrain, city-generator, cave-system, floating-islands, ocean-world, desert-dunes, ice-fortress, mushroom-forest, volcanic-rift, alien-megastructure |
| 15 | Retro/aesthetic demos (Batch 9) | COMPLETE | | 10 demos: crt-monitor, vhs-glitch, synthwave-grid, pixel-dissolve, demoscene-plasma, ascii-render, neon-noir, gameboy-shader, vector-arcade, glitch-portrait |
| 16 | Organic/nature demos (Batch 10) | COMPLETE | | 10 demos: tree-growth, coral-reef, weather-system, crystal-formation, mycelium-network, butterfly-swarm, flower-bloom, erosion-canyon, frost-patterns, kelp-forest |
| 17 | Abstract math art demos (Batch 11) | COMPLETE | | 10 demos: strange-attractor, hyperbolic-plane, lissajous-web, klein-bottle, mandelbulb-3d, fibonacci-spiral, moebius-flow, penrose-tiles, hopf-fibration, julia-morph |
| 18 | Game-ready technique demos (Batch 12) | COMPLETE | | 10 demos: shadow-cascade, ssao-showcase, pbr-material-lab, gpu-culling, lod-transition, deferred-lights, volumetric-fog-rays, screen-reflections, motion-blur-demo, toon-outline |
| 19 | Gallery search & filter | COMPLETE | | Text search + 13-tag category filtering with sticky filter bar, result counts, empty state |
| 20 | Unified Scene Manifest | COMPLETE | | manifest.yaml for all 146 demos, Zod schema, build-time registry generation |

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

### 12. Audio-Reactive / Music — Batch 6 (2026-03-28)

10 demos with CPU-simulated audio driving visuals — no Web Audio API dependency:

- [x] **REQ-23**: Beat-driven instanced mesh animation (beat-pulse-grid, drum-machine-cubes) `COMPLETE`
- [x] **REQ-24**: Frequency spectrum vertex displacement (frequency-mountains, waveform-tunnel) `COMPLETE`
- [x] **REQ-25**: Audio-reactive volumetric/ribbon effects (bass-nebula, synth-aurora) `COMPLETE`
- [x] **REQ-26**: Music visualization patterns (equalizer-city, piano-waterfall, vinyl-grooves, sonic-bloom) `COMPLETE`

**Demos**: beat-pulse-grid, frequency-mountains, waveform-tunnel, synth-aurora, drum-machine-cubes, bass-nebula, vinyl-grooves, equalizer-city, piano-waterfall, sonic-bloom

### 13. Physics Playgrounds — Batch 7 (2026-03-28)

10 demos exploring GPU compute and CPU physics simulations:

- [x] **REQ-27**: GPU compute cloth/spring/wave simulations (cloth-wind, spring-mesh, elastic-waves) `COMPLETE`
- [x] **REQ-28**: Particle-based fluid and collision (fluid-pressure, collision-cascade, magnetic-fields) `COMPLETE`
- [x] **REQ-29**: CPU Verlet integration demos (rope-bridge, ragdoll-fall, soft-body-bounce) `COMPLETE`
- [x] **REQ-30**: Chaotic dynamics visualization (pendulum-chaos) `COMPLETE`

**Demos**: cloth-wind, soft-body-bounce, rope-bridge, fluid-pressure, ragdoll-fall, spring-mesh, magnetic-fields, collision-cascade, elastic-waves, pendulum-chaos

### 14. Procedural Worlds — Batch 8 (2026-03-28)

10 demos generating entire environments procedurally:

- [x] **REQ-31**: Terrain/landscape generation (infinite-terrain, desert-dunes, ocean-world) `COMPLETE`
- [x] **REQ-32**: Architectural generation (city-generator, ice-fortress, alien-megastructure) `COMPLETE`
- [x] **REQ-33**: Natural environments (cave-system, floating-islands, mushroom-forest, volcanic-rift) `COMPLETE`

**Demos**: infinite-terrain, city-generator, cave-system, floating-islands, ocean-world, desert-dunes, ice-fortress, mushroom-forest, volcanic-rift, alien-megastructure

### 15. Retro / Aesthetic — Batch 9 (2026-03-28)

10 demos recreating classic visual styles via screen-space shaders:

- [x] **REQ-34**: Display technology simulation (crt-monitor, vhs-glitch, gameboy-shader) `COMPLETE`
- [x] **REQ-35**: Retro aesthetic scenes (synthwave-grid, vector-arcade, neon-noir) `COMPLETE`
- [x] **REQ-36**: Shader art effects (pixel-dissolve, demoscene-plasma, ascii-render, glitch-portrait) `COMPLETE`

**Demos**: crt-monitor, vhs-glitch, synthwave-grid, pixel-dissolve, demoscene-plasma, ascii-render, neon-noir, gameboy-shader, vector-arcade, glitch-portrait

### 16. Organic / Nature — Batch 10 (2026-03-28)

10 demos simulating natural growth, ecosystems, and weather:

- [x] **REQ-37**: Growth algorithms (tree-growth, crystal-formation, mycelium-network, frost-patterns) `COMPLETE`
- [x] **REQ-38**: Ecosystem scenes (coral-reef, kelp-forest, butterfly-swarm, flower-bloom) `COMPLETE`
- [x] **REQ-39**: Environmental simulation (weather-system, erosion-canyon) `COMPLETE`

**Demos**: tree-growth, coral-reef, weather-system, crystal-formation, mycelium-network, butterfly-swarm, flower-bloom, erosion-canyon, frost-patterns, kelp-forest

### 17. Abstract Math Art — Batch 11 (2026-03-28)

10 demos visualizing mathematical concepts and structures:

- [x] **REQ-40**: Strange attractors and chaos (strange-attractor, pendulum-chaos via batch 7) `COMPLETE`
- [x] **REQ-41**: Parametric surfaces and topology (klein-bottle, moebius-flow, hopf-fibration) `COMPLETE`
- [x] **REQ-42**: Fractal rendering (mandelbulb-3d, julia-morph) `COMPLETE`
- [x] **REQ-43**: Tiling and patterns (penrose-tiles, fibonacci-spiral, hyperbolic-plane, lissajous-web) `COMPLETE`

**Demos**: strange-attractor, hyperbolic-plane, lissajous-web, klein-bottle, mandelbulb-3d, fibonacci-spiral, moebius-flow, penrose-tiles, hopf-fibration, julia-morph

### 18. Game-Ready Techniques — Batch 12 (2026-03-28)

10 demos showcasing production rendering techniques:

- [x] **REQ-44**: Lighting techniques (shadow-cascade, deferred-lights, volumetric-fog-rays) `COMPLETE`
- [x] **REQ-45**: Screen-space effects (ssao-showcase, screen-reflections, motion-blur-demo) `COMPLETE`
- [x] **REQ-46**: Rendering optimization (gpu-culling, lod-transition) `COMPLETE`
- [x] **REQ-47**: Material and style (pbr-material-lab, toon-outline) `COMPLETE`

**Demos**: shadow-cascade, ssao-showcase, pbr-material-lab, gpu-culling, lod-transition, deferred-lights, volumetric-fog-rays, screen-reflections, motion-blur-demo, toon-outline

### 19. Gallery Search & Filter (2026-03-28)

- [x] **REQ-48**: Text search filtering on demo title and description `COMPLETE`
- [x] **REQ-49**: Tag-based category filtering with 13 tags matching batch themes `COMPLETE`
- [x] **REQ-50**: Sticky filter bar with search input, tag pills, result count, and clear button `COMPLETE`
- [x] **REQ-51**: Combined AND/OR filter logic (search AND any-active-tag) `COMPLETE`

### 20. Unified Scene Manifest (2026-03-28)

- [x] **REQ-52**: Zod-validated manifest schema (v2.0) with meta, renderer, camera, environment, techniques, quality fields `COMPLETE`
- [x] **REQ-53**: 146 manifest.yaml files generated from registry data `COMPLETE`
- [x] **REQ-54**: Build-time registry generation from manifests via Vite plugin `COMPLETE`
- [x] **REQ-55**: Manifest validation tests — schema, file integrity, uniqueness `COMPLETE`

## Intent Backlog

- **Thumbnails/screenshots**: Auto-capture preview images for gallery cards
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
