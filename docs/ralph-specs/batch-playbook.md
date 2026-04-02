# Demo Batch Playbook — Rules for Maximum Quality

## Mandatory Pre-Read
Before creating ANY demo, read `docs/ralph-specs/learnings.md` in full.

## Composition Principles (from Scene Lab — what separates 5/10 from 9/10)

### Depth Layers — EVERY demo needs all three
| Layer | Distance | Purpose | Example |
|-------|----------|---------|---------|
| **Foreground** | 2-8 units from camera | Frames the view, provides scale | Rocks, particles, floating debris near camera |
| **Midground** | 8-20 units | Main content, hero element | The torus knot, the boids flock, the crystal |
| **Background** | 20+ units | Depth, atmosphere | BackSide sphere, fog, distant stars |
Without foreground, scenes look like "viewing a diorama from above."

### Hero Element — ONE thing must dominate
- ONE element 5-10x larger or brighter than neighbors
- If every crystal glows equally, NOTHING glows — make ONE bright, the rest dim
- Hero gets dedicated rim/accent light if possible
- Place hero at visual center, NOT dead center of viewport

### 60-30-10 Color Rule
- **60%** dominant color (background/ground — the "mood")
- **30%** secondary (mid-ground objects)
- **10%** accent (emissive focal points — concentrated, not scattered)
- Accent color should be OPPOSITE temperature from dominant (cool scene → warm accent)

### Warm Near, Cool Far (Atmospheric Perspective)
- Foreground: warm lights (orange/gold point light near camera)
- Background: cool fog (blue/purple tones)
- This mimics real physics where close = vivid/warm, far = hazy/cool

### Camera = Human Eye Level
- Position the camera where a PERSON would stand
- Terrain demos: camera at y=2 ON the terrain, not 50 units above
- Lower camera makes objects feel monumental
- FOV 55-70 for tech demos, FOV 35-45 for cinematic composition

### Placement: Clustered + Asymmetric
- NEVER place objects on a uniform grid — use 2-4 random clusters
- Leave intentional empty space between clusters
- Tilt/lean objects 5-15 degrees (perfect upright = artificial)
- Size variation within same type (some 2x, some 0.5x)

### Ambient Light — Go BRIGHTER Than You Think
Scene Lab learned from 106 scenes: "every scene needed ambient DOUBLED."
- Cave/enclosed: ambient 0.5+ (not 0.1)
- Landscape: ambient 0.5-0.8
- Night/neon: ambient 0.3+ (not 0.05)
- Rule: brighter is easier to fix than invisible

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

## Atmosphere Rules
- **Every demo MUST have a background** — add a BackSide sphere with dark gradient color (`#020408` for tech, `#040208` for warm, `#020804` for nature). Exception: full-viewport shader demos (fractal, plasma, CRT, gameboy, ASCII).
- **Every lit demo needs 2+ light types** — at minimum ambientLight + directionalLight. A single ambientLight produces flat, boring illumination.
- **All materials should use emissive** — even subtle `emissiveIntensity: 0.3` adds glow against dark backgrounds. Demos with no emissive look dead.

## Color Palette Rules
- Use 4-5 stop gradients (not 2-3)
- Warm-to-cool transitions (orange→cyan, red→blue) create natural energy feel
- Monochrome palettes (all cyan, all purple) work for tech/sci-fi themes
- Complementary pairs (teal+orange, magenta+green) for high contrast

## Animation Rules
- **Slow rotation**: delta * 0.05–0.15 (default for orbiting scenes)
- **Medium rotation**: delta * 0.2–0.3 (accent elements, spinning objects)
- **Fast rotation**: delta * 0.5–1.0 (specific effects only: spinning rings, glitch, retro)
- **Extreme rotation**: delta > 1.0 (must have visual justification)
- Particle breathing: oscSine at 1.5–2.0 speed
- Bone animation amplitude increases toward tips (0.08 + progress * 0.15)
- Pulsing emissive: oscSine(time.mul(0.5)) for slow, time.mul(2.0) for fast
- Minimum ambient light: 0.05 for all lit-material demos (skip for MeshBasicNodeMaterial shader demos)

## Broken Patterns (NEVER USE)
- If()/Discard() in material useMemo — use alphaTest
- PointsNodeMaterial/SpriteNodeMaterial — invisible in R3F/WebGPU
- BoxGeometry material arrays — vertex count 0
- .atan2() on Node — use standalone atan(y,x)
- DoubleSide on additive shells — doubles density
- positionNode for instance transforms — offsets vertices, not instances
- viewportResolution — deprecated, use screenSize

## Performance Rules (ALWAYS FOLLOW)

1. **NEVER allocate objects in useFrame** — `new THREE.Object3D()`, `new THREE.Vector3()`, `new THREE.Matrix4()`, `new THREE.Color()`, `new THREE.Quaternion()`, `new THREE.Euler()` must be created in `useMemo` or module scope, never inside `useFrame`. Use a single `dummy = useMemo(() => new THREE.Object3D(), [])` per component for instance matrix updates.
2. **Materials MUST be in useMemo** — `new THREE.MeshStandardNodeMaterial()` and all material creation must be wrapped in `useMemo(() => { ... }, [deps])`. Creating materials in helper functions is OK if those functions are called from useMemo.
3. **InstancedMesh MUST have frustumCulled={false}** — per-instance frustum culling is wasted CPU for our demos where all instances are typically visible.
4. **Share geometry via useMemo** — if the same geometry type appears 3+ times in a component, create it once with `useMemo` and pass via the `geometry` prop instead of using inline JSX geometry elements.

## Rendering Quality Notes
- **ACES filmic tone mapping** is enabled globally via the Viewer — colors are compressed into a cinematic range. Don't fight it with excessive emissive values.
- **Bloom is NOT global** — demos that want bloom must use BackSide halo shells (proven pattern) or implement per-demo PostProcessing. See `docs/research/spike-postprocessing-cleanup.md` for the TSL post-processing pattern.
- **Never switch material references on hover/state change** — mutate material properties (opacity, emissiveIntensity) imperatively in useFrame instead. Reference switching triggers GPU shader recompilation (3-second freeze).
- **R3F handles dispose automatically** — don't manually call `.dispose()` on geometry/materials. The Canvas `key={demo.name}` unmounts/remounts the fiber tree on demo switch.

## Visual Evaluation Learnings
- **Camera must show the content** — demos with terrain/planes must override the default [0,0,4] camera to look DOWN, not edge-on
- **Dark scenes need ambient > 0.2** — neon/night demos with ambient < 0.1 render as nearly black in screenshots
- **Small objects need bigger scale** — ragdoll/particle demos at default camera distance look like dots. Scale up or move camera closer
- **Compute demos need faster init** — DLA/frost demos grow too slowly, initial seed area should be large so 5-second screenshot captures visible content
- **Buildings need emissive windows** — flat untextured buildings with no window glow look like cardboard boxes
- **Stars need color variation** — monochrome star fields look flat. Mix warm/cool star temperatures

## Demo Naming Convention
- Evocative, 2-3 word names (not technical descriptions)
- Good: "Cosmic Jellyfish", "Phoenix Rising", "Crystal Cavern"
- Bad: "compute-particles-v2", "test-sdf-bloom"
