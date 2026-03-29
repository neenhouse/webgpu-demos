# Gallery Search & Filter — Design Spec

> **Status**: APPROVED
> **Date**: 2026-03-28

## Overview

Add text search and tag-based category filtering to the gallery page so visitors can find demos among 146 entries.

## Registry Changes

Add `tags` field to `DemoMeta` interface:

```typescript
export interface DemoMeta {
  name: string;
  title: string;
  description: string;
  requiresWebGPU: boolean;
  color: string;
  tags: string[]; // category tags for filtering
}
```

### Tag Taxonomy (12 categories, matching batches)

| Tag | Demos | Batch Origin |
|-----|-------|-------------|
| `tsl` | tsl-torus, particle-field, procedural-terrain, crystal-grid, aurora-waves, morphing-sphere, neon-rings, ocean-surface, pulse-grid, spiral-galaxy, flame-orb, dna-helix, wireframe-landscape, plasma-globe, ribbon-dance | Batch 1 (initial) |
| `compute` | compute-particles, galaxy-collision, fluid-sim, aurora-cascade, particle-galaxy-portrait, quantum-field | Batch 2-3 (compute demos) |
| `shader-art` | noise-dissolve, screen-hologram, uv-kaleidoscope, bloom-orbs, sprite-sparks, volumetric-cloud, multi-material, resolution-warp, skeletal-wave, fractal-zoom, cyber-city, deep-sea, particle-morph, black-hole, neural-net, crystal-cavern, time-vortex, cosmic-jellyfish, digital-storm, lava-planet, cyber-tunnel, phoenix-rising, procedural-planet, waveform-viz | Batch 1-3 (advanced effects) |
| `scene` | test-scene, junkyard, alien-garden, medieval-forge, underwater-ruins, cyberpunk-street, desert-outpost, robot-factory, enchanted-forest, space-station, gladiator-arena | Scene pipeline demos |
| `emergent` | reaction-diffusion, boids-murmuration, interference-waves, cellular-life, pendulum-wave, terrain-erosion, gravitational-orbits, voronoi-shatter, smoke-tendrils, sdf-morphscape | Batch 4 |
| `data-viz` | forge-lifecycle, decision-forest, dependency-graph-3d, code-constellation, neural-pipeline-flow, data-flow-pipes, state-machine-3d, architecture-blueprint, timeline-helix, metric-terrain | Batch 5 |
| `audio` | beat-pulse-grid, frequency-mountains, waveform-tunnel, synth-aurora, drum-machine-cubes, bass-nebula, vinyl-grooves, equalizer-city, piano-waterfall, sonic-bloom | Batch 6 |
| `physics` | cloth-wind, soft-body-bounce, rope-bridge, fluid-pressure, ragdoll-fall, spring-mesh, magnetic-fields, collision-cascade, elastic-waves, pendulum-chaos | Batch 7 |
| `procedural` | infinite-terrain, city-generator, cave-system, floating-islands, ocean-world, desert-dunes, ice-fortress, mushroom-forest, volcanic-rift, alien-megastructure | Batch 8 |
| `retro` | crt-monitor, vhs-glitch, synthwave-grid, pixel-dissolve, demoscene-plasma, ascii-render, neon-noir, gameboy-shader, vector-arcade, glitch-portrait | Batch 9 |
| `organic` | tree-growth, coral-reef, weather-system, crystal-formation, mycelium-network, butterfly-swarm, flower-bloom, erosion-canyon, frost-patterns, kelp-forest | Batch 10 |
| `math` | strange-attractor, hyperbolic-plane, lissajous-web, klein-bottle, mandelbulb-3d, fibonacci-spiral, moebius-flow, penrose-tiles, hopf-fibration, julia-morph | Batch 11 |
| `game-ready` | shadow-cascade, ssao-showcase, pbr-material-lab, gpu-culling, lod-transition, deferred-lights, volumetric-fog-rays, screen-reflections, motion-blur-demo, toon-outline | Batch 12 |

Each demo gets 1-2 tags. Primary tag is its batch category. Some demos may get a secondary tag (e.g., `fluid-sim` gets `compute` + `physics`).

## Components

### FilterBar (new component: `src/components/FilterBar.tsx`)

- Text search input with magnifying glass icon
- Placeholder: "Search 146 demos..."
- Horizontal scrollable row of tag pills
- Each pill toggles on/off (multiple tags can be active = OR filter)
- "Clear all" link when any filter is active
- Result count: "Showing N of 146 demos"
- Sticky positioning (sticks to top when scrolling)

### Gallery (modified: `src/components/Gallery.tsx`)

- Add `searchQuery` and `activeTags` state
- Filter `demos` array: text search matches title OR description (case-insensitive), tag filter matches any active tag (OR logic)
- Pass filtered demos to the grid
- Show "No demos match your search" empty state

## CSS (additions to `src/App.css`)

- `.filter-bar` — sticky container, backdrop-blur
- `.filter-search` — input styling matching dark theme
- `.filter-tags` — horizontal scroll container
- `.filter-tag` — pill button, toggle active state with accent color
- `.filter-info` — result count and clear button
- Responsive: tags wrap on mobile

## URL State

No URL params for MVP. Filters reset on page load. Can add `?tag=X&q=Y` in a future iteration if needed.

## Testing

- Add test for tag coverage: every demo in registry has at least one tag
- Add test for tag validity: every tag used is from the known taxonomy
- Add test for filter logic: search + tag filtering produces correct results
