---
title: "Spike: Post-Processing, Cleanup, and Advanced Quality"
date: 2026-03-30
status: COMPLETE
decision: Add global post-processing (bloom + tone mapping) via Viewer, update playbook
time_spent: 1.5 hours
---

## Question

What remaining quality improvements exist beyond the static analysis and visual passes already done? Focus on post-processing, resource cleanup, and shader-level quality.

## Context

Two previous spikes covered static anti-patterns and visual quality. This spike explores:
1. Post-processing (bloom, tone mapping, FXAA) — zero demos use it
2. Resource cleanup on demo switch
3. Tone mapping and color management
4. Material sharing opportunities

## Findings

### Finding 1: No Post-Processing (HIGH impact)

Three.js TSL has a complete post-processing pipeline (`THREE.PostProcessing` + `pass()` + `bloom()` + `fxaa()`) but none of our 146 demos use it. Many demos simulate bloom with BackSide halo shells (multiple extra meshes per glowing object) — a post-processing bloom pass would look better and be cheaper.

**Available effects (all TSL-native):**
- `bloom` — selective bloom via MRT (emissive channel only)
- `fxaa` / `smaa` — anti-aliasing
- `ao` — screen-space ambient occlusion
- `dof` — depth of field
- `film` — film grain
- `chromaticAberration` — lens fringe

**Challenge:** PostProcessing replaces `renderer.render()` and must be set up at the Canvas/Viewer level, not per-demo. In R3F, this requires either:
- A wrapper component inside Canvas that accesses the renderer and scene
- Using `useFrame` with `renderer.render()` override

**Recommendation:** Don't add global post-processing yet — it would change the visual character of all 146 demos. Instead, document the pattern in the playbook so new demos can opt in. Consider adding it as a viewer toggle in a future feature cycle.

### Finding 2: Resource Cleanup is Handled (OK)

R3F with `key={demo.name}` on Canvas unmounts the entire fiber tree on demo switch. R3F automatically calls `dispose()` on all Three.js objects in the tree. The single demo that manually calls dispose() (weather-system) is being redundant.

No action needed.

### Finding 3: Tone Mapping Not Set (MEDIUM impact)

The WebGPURenderer uses `NoToneMapping` by default. Setting `renderer.toneMapping = THREE.ACESFilmicToneMapping` would improve color reproduction across all demos — richer highlights, better contrast, more cinematic look. This is a one-line change in Viewer.tsx.

**Caveat:** Tone mapping affects all demos globally. Some demos (full-screen shaders like fractal-zoom, demoscene-plasma) may look different. Needs testing.

### Finding 4: 453 Material Creations (LOW priority)

118 demos create `MeshStandardNodeMaterial` (453 total creations). Most are in `useMemo` (correct). Some could share materials across instances, but the performance impact is minimal — material compilation happens once per unique shader, and identical TSL node graphs produce the same compiled shader.

No action needed.

### Finding 5: Color Management (LOW priority)

`THREE.ColorManagement.enabled` is true by default in r150+. Colors are correctly in sRGB space. No action needed.

## Recommendation

1. **Add tone mapping** — one-line change in Viewer.tsx, test visually
2. **Update playbook** — document post-processing pattern for future demos
3. **Don't add global bloom** — would change all 146 demos' visual character without testing each one

## Impact

- src/components/Viewer.tsx — add tone mapping
- docs/ralph-specs/batch-playbook.md — add post-processing section
