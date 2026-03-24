---
title: WebGPU Demos Product Requirements
status: ACTIVE
last_updated: 2026-03-24
---

# WebGPU Demos — Product Requirements

## Executive Summary

A gallery of WebGPU experiments built with Three.js WebGPURenderer. Each demo is a self-contained scene showcasing a single WebGPU capability — compute shaders, TSL materials, GPU particles, procedural terrain. The project is at concept stage: scaffold and CI are in place, but no demos or gallery UI exist yet. Priority is proving the WebGPURenderer + R3F integration works, then building the gallery shell and first batch of demos.

## Feature Inventory

| # | Feature | Status | Prove-First | Notes |
|---|---------|--------|-------------|-------|
| 1 | Demo viewer | COMPLETE | PROVEN | WebGPURenderer + R3F Canvas, orbit controls, hash routing, overlay |
| 2 | Demo gallery | COMPLETE | | Responsive grid with accent-colored cards |
| 3 | WebGPU detection | COMPLETE | | Auto-fallback to WebGL with notice banner |
| 4 | Demo templates | COMPLETE | | 5 demos: TSL torus, particle field, terrain, crystal grid, aurora |
| 5 | Batch generation | COMPLETE | | 2 batches run (20 demos generated), Ralph spec + learnings file mature |

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

## Intent Backlog

- **Demo templates (5+ types)**: Compute particle systems, TSL custom materials, GPU-driven terrain, post-processing with compute, instanced geometry. Each template is a self-contained demo that can be batch-generated with variations.
- **Batch generation workflow**: Choo Choo Ralph spec for autonomous demo creation. Given a demo type and variation parameters, generates a new demo directory with scene, metadata, and thumbnail.

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
