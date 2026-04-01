# ThreeForge — Vision

## Vision

A gallery of Three.js WebGPU experiments — each demo explores a different capability of the WebGPURenderer. Shader art, compute simulations, procedural worlds, physics playgrounds, retro aesthetics, organic nature, and game-ready techniques. Built for creative coders and Three.js developers exploring the future of browser 3D. Powered by the Forge delivery pipeline.

## Current State

**Stage**: Active

146 demos across 12 categories: TSL shader art, compute simulations, scene pipeline, emergent systems, interactive data visualizations, audio-reactive music, physics playgrounds, procedural worlds, retro aesthetics, organic nature, abstract math art, and game-ready techniques. Gallery with WebGPU/WebGL auto-detection, scrollable grid, hash routing. Twelve batch generation cycles complete via Choo Choo Ralph. Scene pipeline renders YAML-driven demos. Batches 6-12 expanded into 7 new themed categories with 70 additional demos. CI deploys to Cloudflare Pages.

> **Last updated**: 2026-03-28 (Batches 6-12) — See `docs/prd/` for detailed feature status.

## Audience
- Three.js developers curious about WebGPU migration
- Creative coders and shader artists
- Visitors to neenhouse.com exploring the demo grid
- Anyone interested in the future of browser graphics

## Design Principles
1. **One concept per demo** — each experiment isolates a single WebGPU feature
2. **Gallery browsable** — grid layout, click to enter, back to browse
3. **Graceful fallback** — if WebGPU isn't available, fall back to WebGL with a notice
4. **Batch generated** — Choo Choo Ralph loops create demos autonomously
5. **Visually striking** — each demo should be screenshot-worthy

## Architecture

**Stack**: React 19, TypeScript, Three.js (WebGPURenderer), @react-three/fiber, @react-three/drei, Vite, Cloudflare Pages

```
src/
  main.tsx              — React entry point
  App.tsx               — Hash router (gallery vs viewer)
  components/
    Gallery.tsx         — Demo card grid with search + tag filtering
    FilterBar.tsx       — Search input + 13 tag category pills
    Viewer.tsx          — WebGPURenderer canvas + orbit controls + overlay
  demos/
    <demo-name>/
      index.tsx         — Demo component (self-contained scene)
  lib/
    registry.ts         — Re-exports from manifest-generated registry
    registry-generated.ts — Auto-generated from manifests/*.manifest.yaml
    webgpu-detect.ts    — Feature detection utility
  pipeline/             — Scene YAML rendering pipeline
    spec/               — Zod schema, parser, manifest schema
    generators/         — CSG, SDF, parametric, codegen
    materials/          — 14 PBR presets, resolver
    renderer/           — SceneFromYaml, ObjectRenderer

manifests/              — 146 manifest.yaml files (source of truth for registry)
scripts/                — Build, quality audit, thumbnail capture, verification
```

**Routing**: Hash-based — `/` for gallery, `/viewer#demo-name` for individual demos.

**Renderer**: Three.js `WebGPURenderer` with automatic `WebGLRenderer` fallback.

**State**: React 19 + @react-three/fiber for scene graph. No global state library needed — each demo is self-contained.

## What's Built

| Area | Status | Notes |
|------|--------|-------|
| Vite + React scaffold | Built | Gallery + Viewer SPA |
| Three.js + R3F + WebGPU | Built | WebGPURenderer via async gl prop, WebGL fallback |
| CI/CD (Cloudflare Pages) | Built | Auto-deploys on push to main |
| 146 demos (12 batches) | Built | TSL, compute, scene, emergent, data-viz, audio, physics, procedural, retro, organic, math, game-ready |
| Gallery search + filtering | Built | Text search + 13 tag category pills |
| Scene pipeline spec v1.0 | Built | Engine-agnostic YAML format, 4 generator tiers, 14 material presets |
| Unified manifest system | Built | manifest.yaml per demo, build-time registry generation |
| Quality audit pipeline | Built | Static analysis, Playwright verification, performance checks |
| Thumbnail system | Built | 57 real captures + 89 gradient placeholders |

> For detailed feature requirements, see `docs/prd/prd.md`.

## Key Decisions

1. **R3F over vanilla Three.js** — React component model fits gallery pattern; drei provides orbit controls, loaders
2. **WebGPURenderer as primary, WebGL fallback** — WebGPU enables compute shaders, TSL node materials, and GPU-driven particles. Falls back to WebGLRenderer when unavailable. This is a one-way door: WebGPU-specific features (compute, instancedArray, TSL Fn()) have no WebGL equivalent.
3. **R3F owns the render loop** — We do NOT replace R3F's internal render cycle. This means `@react-three/postprocessing` (WebGL-only, uses WebGLRenderTarget) is incompatible. Three.js TSL-native PostProcessing (`THREE.PostProcessing` + `pass()` + `bloom()`) requires replacing `renderer.render()` which conflicts with R3F's fiber loop. Bloom/SSAO/DOF are achieved per-demo via TSL material tricks (BackSide halo shells, screen-space effects) rather than global post-processing passes.
4. **Hash routing** — simple, no server config, works on Cloudflare Pages
5. **One file per demo** — keeps demos independent, easy to batch-generate
6. **Cloudflare Pages** — free, fast, auto-deploys from GitHub
7. **ACES filmic tone mapping** — Enabled globally on both renderers. Compresses highlights for cinematic color. Demos should not fight it with excessive emissive values (max 3.0).

## Technology Tradeoffs

| What we gain (WebGPU + R3F) | What we give up |
|-----|------|
| Compute shaders (instancedArray, Fn().compute()) | No `@react-three/postprocessing` (WebGL-only) |
| TSL node materials (colorNode, positionNode) | No global Bloom/SSAO/DOF post-processing pass |
| GPU-driven particles and physics | Post-processing must be done per-demo via TSL tricks |
| React component model for scene graph | Cannot replace R3F render loop |
| Automatic dispose on unmount (key={demo.name}) | WebGPU not available in all browsers |
| WebGL fallback for non-compute demos | Compute demos show "requires WebGPU" block |

### Why not global post-processing?

Scene Lab (babylon-demos) uses `@react-three/postprocessing` for Bloom + Vignette, which dramatically improves visual quality. We cannot use it because:

1. `@react-three/postprocessing` wraps the `postprocessing` npm package which uses `WebGLRenderTarget` — incompatible with `WebGPURenderer`
2. Three.js TSL-native `THREE.PostProcessing` requires calling `postProcessing.render()` instead of `renderer.render()`, which conflicts with R3F's fiber reconciler that owns the render call
3. The R3F render loop is not replaceable without forking fiber or using `frameloop="never"` + manual rendering, which breaks React integration (useFrame, invalidate, performance regression)

**Our alternative:** Per-demo visual effects via TSL material nodes:
- BackSide halo shells with AdditiveBlending for bloom-like glow
- Screen-space vignette via screenUV distance
- Emissive materials with ACES tone mapping for bright highlights
- HemisphereLight for ambient depth (sky/ground fill)

These are cheaper than post-processing passes and work on both WebGPU and WebGL fallback.

## Glossary

| Term | Definition |
|------|-----------|
| WebGPU | Next-gen browser graphics API, successor to WebGL |
| WebGPURenderer | Three.js renderer that uses WebGPU instead of WebGL |
| TSL | Three Shading Language — Three.js node-based shader system for WebGPU |
| Compute shader | GPU program for general-purpose computation (particles, physics, terrain) |
| R3F | @react-three/fiber — React renderer for Three.js |
| drei | @react-three/drei — helper components for R3F (controls, loaders, etc.) |
