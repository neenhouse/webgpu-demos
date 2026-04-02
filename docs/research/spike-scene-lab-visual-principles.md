---
title: "Spike: Scene Lab Visual Principles for ThreeForge"
date: 2026-04-02
status: COMPLETE
decision: Adopt 12 key visual principles from Scene Lab into ThreeForge playbook
time_spent: 1.5 hours
---

## Question

What visual principles from Scene Lab's scene-creator agent can improve ThreeForge's demo quality? Our visual evaluation passes catch broken demos but don't improve mediocre ones.

## Key Gap

Our playbook has rules about what NOT to do (broken patterns, emissive limits) but almost nothing about what makes a demo look GOOD. Scene Lab has a comprehensive 10-phase pipeline with principles learned from polishing 106 scenes.

## Top 12 Principles to Adopt (from Scene Lab)

### 1. Ambient Light Must Be MUCH Higher (Phase 3)
Scene Lab learned: "Every scene in the first full polish pass needed ambient light DOUBLED or more."
- Cave/enclosed: ambient 0.5-1.0 (we use 0.05-0.15)
- Landscape: ambient 0.5-0.8 (we use 0.1-0.2)
- Night/neon: ambient 0.3-0.5 (we use 0.05-0.1)
- Rule: "When in doubt, go brighter — easier to darken than debug invisibility"

### 2. Three Depth Layers Required (Phase 6)
Every scene needs foreground + midground + background:
- Foreground (2-8 units from camera): rocks, flowers, particles — frames the view
- Midground: main content, hero element
- Background: sky/fog/stars — creates infinite depth
- "If a scene only has midground content, it looks flat"

### 3. Hero Scale Contrast (Phase 6b)
ONE element should be 5-10x larger than neighbors. Without it, everything is equally uninteresting.
- Hero gets dedicated rim light or spotlight
- "If every crystal glows the same, NOTHING glows"

### 4. 60-30-10 Color Rule (Phase 6b)
- 60% dominant (sky, ground — the mood color)
- 30% secondary (mid-ground objects)
- 10% accent (emissive focal points)
- Accent OPPOSITE temperature from dominant (cool scene → warm accent)
- Accent CONCENTRATED at focal point, not scattered uniformly

### 5. Warm Near + Cool Far (Phase 6b)
Atmospheric temperature gradient:
- Near camera: warm light (orange/gold point light)
- Far from camera: cool fog (blue/purple)
- Mimics real atmospheric perspective

### 6. Camera Position = Human Eye Level (Phase 3)
Camera should be where a person would STAND:
- Landscape: eye level ON the terrain (~y=2), not above
- Cave: inside, tight zoom limits
- "50 units above looking down is a map, not a landscape"

### 7. Fog Color Must Match Background (Phase 3)
- Fog color = background/sky color → seamless distance fade
- Without fog, you see hard edges of the scene boundary
- Exponential fog looks more natural than linear for outdoor

### 8. Objects Grow From Surfaces (Spatial Rules)
- Crystals from walls, trees from terrain, coral from seafloor
- "If objects don't relate to a surface, they look randomly scattered"
- Every visible light source needs a visible fixture

### 9. Shape Recognizability Without Color (Phase 4)
- "If I showed this mesh to someone with no label, would they know what it is?"
- If ambiguous: make it detailed enough, replace with something recognizable, or remove it
- "A scene without fish is better than pill-shaped capsules labeled fish"

### 10. Clustered Asymmetric Placement (Phase 6b)
- NEVER place on uniform grid — use 2-4 cluster centers
- Leave intentional voids between clusters
- Tilt/lean objects 5-15 degrees
- "Without foreground objects, scenes look like viewing a diorama from above"

### 11. Lower FOV = More Cinematic (Phase 6b)
- FOV 35-45 feels directed, FOV 55+ feels like security camera
- Low camera makes objects monumental
- Hero at rule-of-thirds intersection, not dead center

### 12. Size Variation Within Types (Phase 5)
- Size: some 2x, some 0.5x
- Color: HSL offset for variation
- Rotation: vary per instance
- "If everything is the same size, the scene lacks scale"

## What We Should NOT Adopt

- Post-processing (Bloom, Vignette) — WebGL-only, incompatible with our WebGPU renderer
- drei `<Sky>`, `<MeshReflectorMaterial>`, `<ContactShadows>`, `<Cloud>`, `<Environment>` — WebGL-only
- `toneMapped={false}` pattern — requires per-material annotation (future work)
- Visual toolkit components (Rock, Stalagmite, etc.) — would be great but large scope

## Impact

- Update batch-playbook.md with adapted principles
- These principles should inform the quality evaluation rubric in visual-eval
- Future demo batches should follow these composition rules
