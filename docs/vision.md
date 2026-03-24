# WebGPU Demos — Vision

## Vision

A gallery of WebGPU experiments built with Three.js — each demo showcases a different capability of the WebGPURenderer. Compute shaders, GPU particles, TSL materials, procedural worlds. Built for creative coders and Three.js developers exploring the future of browser 3D.

## Current State

**Stage**: Prototype

Gallery grid, demo viewer with WebGPU/WebGL auto-detection, and hash routing are built. 5 demos showcase different TSL techniques: torus knot, particle field, procedural terrain, crystal grid, and aurora waves. CI deploys to Cloudflare Pages.

> **Last updated**: 2026-03-24 — See `docs/prd/` for detailed feature status.

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
  App.tsx               — Gallery grid (homepage)
  demos/
    <demo-name>/
      index.tsx         — Demo component (self-contained scene)
      meta.ts           — Title, description, thumbnail
  components/
    Viewer.tsx          — WebGPURenderer canvas + orbit controls
    FallbackNotice.tsx  — WebGL fallback message
  lib/
    webgpu-detect.ts    — Feature detection utility
```

**Routing**: Hash-based — `/` for gallery, `/viewer#demo-name` for individual demos.

**Renderer**: Three.js `WebGPURenderer` with automatic `WebGLRenderer` fallback.

**State**: React 19 + @react-three/fiber for scene graph. No global state library needed — each demo is self-contained.

## What's Built vs Planned

| Area | Status | Notes |
|------|--------|-------|
| Vite + React scaffold | Built | Replaced default with gallery/viewer |
| Three.js + R3F + WebGPU | Built | WebGPURenderer via async gl prop |
| CI/CD (Cloudflare Pages) | Built | Auto-deploys on push to main |
| CI checks (build + lint) | Built | GitHub Actions workflow |
| Demo viewer | Built | Full-screen canvas, orbit controls, overlay, hash routing |
| Demo gallery | Built | Responsive grid with accent-colored cards |
| WebGPU detection/fallback | Built | Auto-detects, falls back to WebGL with notice |
| Demo templates (5) | Built | TSL torus, particles, terrain, crystals, aurora |
| Batch generation workflow | Planned | Choo Choo Ralph spec |

> For detailed feature requirements, see `docs/prd/prd.md`.

## Key Decisions

1. **R3F over vanilla Three.js** — React component model fits gallery pattern; drei provides orbit controls, loaders
2. **Hash routing** — simple, no server config, works on Cloudflare Pages
3. **One file per demo** — keeps demos independent, easy to batch-generate
4. **Cloudflare Pages** — free, fast, auto-deploys from GitHub

## Glossary

| Term | Definition |
|------|-----------|
| WebGPU | Next-gen browser graphics API, successor to WebGL |
| WebGPURenderer | Three.js renderer that uses WebGPU instead of WebGL |
| TSL | Three Shading Language — Three.js node-based shader system for WebGPU |
| Compute shader | GPU program for general-purpose computation (particles, physics, terrain) |
| R3F | @react-three/fiber — React renderer for Three.js |
| drei | @react-three/drei — helper components for R3F (controls, loaders, etc.) |
