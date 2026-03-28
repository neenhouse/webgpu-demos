# Batches 6-12: 70 New WebGPU Demos — Design Spec

> **Status**: APPROVED
> **Date**: 2026-03-28

## Overview

7 new batches of 10 demos each (70 total), bringing the gallery from 76 to 146 demos. Each batch explores a distinct theme with dedicated WebGPU/TSL techniques.

## Batch Themes

| Batch | Theme | Key Techniques |
|-------|-------|----------------|
| 6 | Audio-Reactive / Music | Simulated FFT, beat detection, frequency-driven displacement, waveform rendering |
| 7 | Physics Playgrounds | Verlet integration, position-based dynamics, spring systems, GPU collision |
| 8 | Procedural Worlds | Noise-based terrain, L-system vegetation, biome blending, infinite scrolling |
| 9 | Retro / Aesthetic | Screen-space post-processing, palette reduction, CRT/VHS simulation, dithering |
| 10 | Organic / Nature | Growth algorithms, L-systems, procedural branching, swaying/wind animation |
| 11 | Abstract Math Art | Parametric surfaces, strange attractors, fractal raymarching, topology |
| 12 | Game-Ready Techniques | Shadow mapping, SSAO, deferred rendering, GPU culling, PBR exploration |

## Batch 6: Audio-Reactive / Music

| # | Slug | Title | Description | Color | WebGPU |
|---|------|-------|-------------|-------|--------|
| 1 | beat-pulse-grid | Beat Pulse Grid | 20x20 grid of pillars with height driven by simulated beat frequency bands | #ff2266 | false |
| 2 | frequency-mountains | Frequency Mountains | 3D terrain mesh with vertex displacement driven by 64-band simulated spectrum | #4400ff | false |
| 3 | waveform-tunnel | Waveform Tunnel | Fly-through tunnel with walls deforming to scrolling waveform data | #00ffaa | false |
| 4 | synth-aurora | Synth Aurora | Aurora ribbon curtains with color and sway driven by synthesizer tone simulation | #8800ff | false |
| 5 | drum-machine-cubes | Drum Machine Cubes | 4x4 grid of instanced cube groups triggering scale/emissive pulses on rhythmic patterns | #ff8800 | false |
| 6 | bass-nebula | Bass Nebula | Volumetric shell cloud pulsing radius and opacity to bass frequency simulation | #2200aa | false |
| 7 | vinyl-grooves | Vinyl Grooves | Spinning disk with groove displacement rings and tone-arm tracking animation | #cc8800 | false |
| 8 | equalizer-city | Equalizer City | Cityscape of 200 instanced buildings with heights animated by frequency band data | #ff0066 | false |
| 9 | piano-waterfall | Piano Waterfall | 88-key MIDI waterfall display with note blocks cascading down and velocity-based glow | #0088ff | false |
| 10 | sonic-bloom | Sonic Bloom | Procedural flowers that bloom/pulse in response to simulated harmonic overtone series | #ff44ff | false |

**Shared technique**: All audio demos use CPU-simulated audio data (multi-frequency sine waves + noise) pushed to GPU via uniforms or instancedArray. No Web Audio API dependency — keeps demos self-contained.

## Batch 7: Physics Playgrounds

| # | Slug | Title | Description | Color | WebGPU |
|---|------|-------|-------------|-------|--------|
| 1 | cloth-wind | Cloth in Wind | GPU compute cloth simulation with 64x64 grid, wind forces, pin constraints | #44aaff | true |
| 2 | soft-body-bounce | Soft Body Bounce | Deformable sphere with pressure-based soft body physics bouncing on a plane | #ff6644 | true |
| 3 | rope-bridge | Rope Bridge | Verlet integration rope/chain with gravity, fixed endpoints, and collision with obstacles | #88cc22 | false |
| 4 | fluid-pressure | Fluid Pressure | SPH-lite fluid particles in a container with pressure forces and surface tension | #2288ff | true |
| 5 | ragdoll-fall | Ragdoll Fall | Articulated stick figure with joint constraints tumbling through obstacle course | #ff4488 | false |
| 6 | spring-mesh | Spring Mesh | Spring-connected mesh grid that ripples and deforms on impact from falling spheres | #44ffaa | true |
| 7 | magnetic-fields | Magnetic Fields | Particles tracing magnetic field lines between dipole pairs with velocity-based color | #8844ff | true |
| 8 | collision-cascade | Collision Cascade | Chain reaction of 200 rigid spheres with elastic collision response and energy coloring | #ffaa00 | true |
| 9 | elastic-waves | Elastic Waves | Wave propagation through 2D elastic medium with compute-driven stress tensor | #00aaff | true |
| 10 | pendulum-chaos | Pendulum Chaos | Triple pendulum with chaotic trajectories, trail rendering, and Lyapunov coloring | #ff2244 | false |

## Batch 8: Procedural Worlds

| # | Slug | Title | Description | Color | WebGPU |
|---|------|-------|-------------|-------|--------|
| 1 | infinite-terrain | Infinite Terrain | Endless scrolling terrain with multi-octave noise, 4 biomes, and LOD ring system | #44aa22 | false |
| 2 | city-generator | City Generator | Procedural city blocks with roads, varied building heights, and neon window lights | #ff6600 | false |
| 3 | cave-system | Cave System | Underground cave with noise-carved walls, stalactites, bioluminescent pools | #664422 | false |
| 4 | floating-islands | Floating Islands | Sky islands with waterfalls (particle streams), vegetation tufts, and cloud wisps | #44ccff | false |
| 5 | ocean-world | Ocean World | Vast ocean plane with multi-layer wave displacement, foam lines, and underwater caustics | #0066aa | false |
| 6 | desert-dunes | Desert Dunes | Wind-sculpted dune field with ripple displacement, heat haze screen effect, sand particles | #cc9944 | false |
| 7 | ice-fortress | Ice Fortress | Crystalline ice structures with fresnel refraction, sub-surface glow, and frost particles | #88ddff | false |
| 8 | mushroom-forest | Mushroom Forest | Giant bioluminescent mushrooms with pulsing caps, spore particles, and fog | #22cc88 | false |
| 9 | volcanic-rift | Volcanic Rift | Lava river through cracked terrain with smoke particles, ember sparks, heat distortion | #ff3300 | false |
| 10 | alien-megastructure | Alien Megastructure | Non-euclidean architecture with impossible geometry, portal effects, and energy conduits | #aa22ff | false |

## Batch 9: Retro / Aesthetic

| # | Slug | Title | Description | Color | WebGPU |
|---|------|-------|-------------|-------|--------|
| 1 | crt-monitor | CRT Monitor | Full CRT simulation: scanlines, phosphor glow, screen curvature, vignette, color bleed | #33ff33 | false |
| 2 | vhs-glitch | VHS Glitch | VHS tape effects: tracking errors, chromatic aberration, noise bands, color shift | #ff3333 | false |
| 3 | synthwave-grid | Synthwave Grid | 80s retrowave infinite grid, neon sun, mountain silhouette, chrome text feel | #ff00ff | false |
| 4 | pixel-dissolve | Pixel Dissolve | 3D scene progressively dissolving into chunky pixel-art blocks | #00ff88 | false |
| 5 | demoscene-plasma | Demoscene Plasma | Classic demo plasma effect with layered sine waves and cycling palettes | #ff8800 | false |
| 6 | ascii-render | ASCII Render | 3D scene rendered as ASCII characters via screen-space luminance mapping | #00ff00 | false |
| 7 | neon-noir | Neon Noir | Rain-soaked neon street scene with film noir palette, wet reflections, volumetric light | #ff0044 | false |
| 8 | gameboy-shader | Gameboy Shader | 4-color green palette, dithering patterns, LCD pixel grid, DMG-style rendering | #88bb22 | false |
| 9 | vector-arcade | Vector Arcade | Wireframe vector graphics with phosphor glow trails (Asteroids/Tempest aesthetic) | #00ffff | false |
| 10 | glitch-portrait | Glitch Portrait | Face-like mesh with data corruption: block displacement, RGB split, scan distortion | #ff22aa | false |

## Batch 10: Organic / Nature

| # | Slug | Title | Description | Color | WebGPU |
|---|------|-------|-------------|-------|--------|
| 1 | tree-growth | Tree Growth | L-system tree growing in real time with branching cylinders and leaf particles | #228822 | false |
| 2 | coral-reef | Coral Reef | Branching coral structures with swaying fish, anemones, and caustic lighting | #ff8844 | false |
| 3 | weather-system | Weather System | Cloud formation, rain particles, lightning strikes cycling through weather states | #4488cc | true |
| 4 | crystal-formation | Crystal Formation | Crystals growing from seed points with faceted geometry and refraction glow | #aa44ff | false |
| 5 | mycelium-network | Mycelium Network | Underground fungal network spreading tendrils with nutrient pulse particles | #ccaa22 | false |
| 6 | butterfly-swarm | Butterfly Swarm | Morpho butterflies with iridescent wing fresnel and flocking behavior | #2288ff | false |
| 7 | flower-bloom | Flower Bloom | Time-lapse flower opening with petal unfurling animation and pollen particles | #ff66aa | false |
| 8 | erosion-canyon | Erosion Canyon | Water carving through layered rock with sediment coloring and river flow | #aa6633 | true |
| 9 | frost-patterns | Frost Patterns | Ice crystals forming on glass surface via DLA (diffusion-limited aggregation) | #88ccff | true |
| 10 | kelp-forest | Kelp Forest | Underwater kelp strands swaying with current, light shafts, fish particles | #22aa44 | false |

## Batch 11: Abstract Math Art

| # | Slug | Title | Description | Color | WebGPU |
|---|------|-------|-------------|-------|--------|
| 1 | strange-attractor | Strange Attractor | Lorenz/Rössler attractor with 5000 instanced particle trail points | #ff4400 | false |
| 2 | hyperbolic-plane | Hyperbolic Plane | Poincare disk with tessellated triangles and hyperbolic transformations | #8822ff | false |
| 3 | lissajous-web | Lissajous Web | 3D Lissajous curves forming web-like structures with phase animation | #00ddff | false |
| 4 | klein-bottle | Klein Bottle | Non-orientable surface with TSL inside/outside coloring and transparency | #ff8822 | false |
| 5 | mandelbulb-3d | Mandelbulb 3D | 3D Mandelbrot set via SDF raymarching with orbit trap coloring | #2244ff | false |
| 6 | fibonacci-spiral | Fibonacci Spiral | Phyllotaxis sunflower pattern with golden-angle instanced elements | #ffcc00 | false |
| 7 | moebius-flow | Moebius Flow | Particles flowing along Mobius strip surface with twist visualization | #44ff88 | false |
| 8 | penrose-tiles | Penrose Tiles | Aperiodic Penrose tiling extruded into 3D with per-tile coloring | #ff44cc | false |
| 9 | hopf-fibration | Hopf Fibration | 4D-to-3D projection of Hopf fibration circles with animated parameter | #4488ff | false |
| 10 | julia-morph | Julia Morph | Animated Julia set with morphing c-parameter on full-viewport plane | #ff2266 | false |

## Batch 12: Game-Ready Techniques

| # | Slug | Title | Description | Color | WebGPU |
|---|------|-------|-------------|-------|--------|
| 1 | shadow-cascade | Shadow Cascade | Cascaded shadow maps with 3 splits, soft PCF filtering, shadow visualization | #334455 | false |
| 2 | ssao-showcase | SSAO Showcase | Screen-space ambient occlusion on a detailed scene with radius/intensity controls | #556677 | false |
| 3 | pbr-material-lab | PBR Material Lab | Interactive PBR material sphere with roughness/metalness/normal map exploration | #aabbcc | false |
| 4 | gpu-culling | GPU Culling | 10000 instanced objects with compute frustum culling, showing culled vs visible counts | #44cc44 | true |
| 5 | lod-transition | LOD Transition | 3 LOD levels with smooth morphing transitions based on camera distance | #ff8844 | false |
| 6 | deferred-lights | Deferred Lights | 100+ dynamic point lights on a scene using MRT deferred rendering pipeline | #ffcc44 | true |
| 7 | volumetric-fog-rays | Volumetric Fog Rays | God rays through fog volume with light scattering and shadow | #aabb88 | false |
| 8 | screen-reflections | Screen Reflections | Screen-space reflections on a glossy floor with fallback for off-screen | #4466aa | false |
| 9 | motion-blur-demo | Motion Blur Demo | Per-object motion blur on spinning/flying objects with velocity buffer | #ff6644 | false |
| 10 | toon-outline | Toon Outline | Cel shading with Sobel edge detection outlines and N-tone ramp shading | #ffaa22 | false |

## Learning Strategy

After each batch:
1. Append new TSL/WebGPU patterns to `docs/ralph-specs/learnings.md`
2. Update broken patterns if any new ones discovered
3. Update `docs/ralph-specs/batch-playbook.md` with technique combos
4. Update PRD feature inventory with new batch row (COMPLETE)
5. Update `docs/vision.md` demo count

## Execution Order

Sequential: 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12. Each batch builds on patterns from prior batches.
