# Demo Batch Playbook — Rules for Maximum Quality

## Mandatory Pre-Read
Before creating ANY demo, read `docs/ralph-specs/learnings.md` in full.

## Complexity Requirements (Batch 4+)
- Every demo MUST combine 4+ proven techniques
- Minimum 200 lines of code (anything shorter isn't complex enough)
- Must include at least ONE of: compute shader, SDF raymarching, skeletal animation, or screen-space effects

## Proven Technique Combinations (Best Results)
These combinations produced the best visual results in Batch 3:

| Combo | Example | Why It Works |
|-------|---------|-------------|
| Compute + instanced + bloom | Cosmic Jellyfish, Quantum Field | Physics-driven particles with glowing halos = organic feel |
| SDF + screen-space + bloom | Cyber Tunnel, Digital Storm | Full-viewport effects with depth and glow = immersive |
| Skeletal + dissolve + particles | Phoenix Rising | Animated structure + fire effect + trailing particles = dramatic |
| Multi-material + instanced + hash palette | Crystal Cavern | Variety from math, not unique objects = efficient beauty |
| Compute curtains + reflections + gradient | Aurora Cascade | Large-scale atmospheric effect with ground mirror = cinematic |

## Visual Quality Rules (Hard Rules)
1. **Emissive max 3x** — above this, colors blow out to white
2. **Volumetric shell opacity: 0.015-0.04** — with 6+ additive shells
3. **BackSide for ALL halo/volumetric shells** — never DoubleSide
4. **Fresnel pow(1.5-2.5)** — scale by layer (inner=1.5, outer=2.5)
5. **Inverse-square falloff for glow** — `K / (dist² + epsilon)`
6. **XY-plane for camera-facing layouts** — not XZ (edge-on from [0,0,4])
7. **hash(positionWorld) for per-instance variation** — not custom attributes
8. **float(uniform) wrapper** — for TypeScript compat with TSL math

## Color Palette Rules
- Use 4-5 stop gradients (not 2-3)
- Warm-to-cool transitions (orange→cyan, red→blue) create natural energy feel
- Monochrome palettes (all cyan, all purple) work for tech/sci-fi themes
- Complementary pairs (teal+orange, magenta+green) for high contrast

## Animation Rules
- Slow rotation: delta * 0.05-0.15 (not faster)
- Particle breathing: oscSine at 1.5-2.0 speed
- Bone animation amplitude increases toward tips (0.08 + progress * 0.15)
- Pulsing emissive: oscSine(time.mul(0.5)) for slow, time.mul(2.0) for fast

## Broken Patterns (NEVER USE)
- If()/Discard() in material useMemo — use alphaTest
- PointsNodeMaterial/SpriteNodeMaterial — invisible in R3F/WebGPU
- BoxGeometry material arrays — vertex count 0
- .atan2() on Node — use standalone atan(y,x)
- DoubleSide on additive shells — doubles density
- positionNode for instance transforms — offsets vertices, not instances
- viewportResolution — deprecated, use screenSize

## Demo Naming Convention
- Evocative, 2-3 word names (not technical descriptions)
- Good: "Cosmic Jellyfish", "Phoenix Rising", "Crystal Cavern"
- Bad: "compute-particles-v2", "test-sdf-bloom"
