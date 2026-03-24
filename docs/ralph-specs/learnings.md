# Batch Demo Learnings

## Last updated: 2026-03-24 (Demo 4)

## Working Patterns

- **`hash()` for dissolve noise**: `hash(positionLocal.mul(N))` generates position-based pseudo-random values. Different multiplier values (25, 67, 143) create different frequency patterns. Blending multiple hash octaves (`noise1.mul(0.5).add(noise2.mul(0.3)).add(noise3.mul(0.2))`) produces more interesting visual variety than a single hash call.
- **`smoothstep()` for edge detection**: `smoothstep(threshold, threshold.add(width), noise)` creates a soft transition band at the dissolve edge. Width of 0.08-0.1 gives a good visible edge glow region.
- **`alphaTest` for fragment discard**: Using `mat.transparent = true` + `mat.alphaTest = 0.5` + `mat.opacityNode = smoothstep(...)` is the correct pattern for discarding fragments in React/R3F context. Direct `If()`/`Discard()` calls fail because `currentStack` is null outside shader compilation context.
- **`mix()` for color blending**: Combining base colors with edge colors using `mix(baseColor, edgeColor, edgeGlow.pow(0.6))` works well for smooth transitions.
- **`Fn()` for fresnel**: Wrapping fresnel calculation in `Fn(() => { ... })` and calling with `fresnel()` works correctly for grouping node computations.
- **`DoubleSide` for dissolve effects**: Setting `mat.side = THREE.DoubleSide` is essential for dissolve effects so backfaces of the geometry are visible through the dissolved holes.
- **`screenUV` for screen-space effects**: `screenUV` from `three/tsl` gives fragment position in normalized screen coordinates [0,1]. `screenUV.y` is especially useful for horizontal scanlines and gradient effects that stay fixed to the viewport regardless of object rotation.
- **`sin()` + `screenUV` for scanlines**: `sin(screenUV.y.mul(frequency).add(time.mul(speed)))` creates scrolling horizontal scanlines. Frequency ~200 gives fine CRT-like lines; ~8 gives wide glitch bands. Use `smoothstep` to sharpen the sine wave into distinct bright lines.
- **`fract()` for repeating line patterns**: `fract(screenUV.y.mul(N).add(time.mul(speed)))` creates repeating sawtooth patterns useful for thin line artifacts. Combining with `smoothstep` on both ends creates thin bright stripes.
- **`mix()` with `screenUV` for screen-space gradients**: `mix(colorA, colorB, screenUV.y)` creates a vertical color gradient across the viewport, useful for holographic or atmospheric effects where color varies by screen position.
- **Avoid reading back `mat.opacityNode`**: The TS type for `mat.opacityNode` is `Node | null`, which lacks `.mul()`. Store opacity in a local variable and compose the full expression before assigning to `mat.opacityNode` once.
- **`uv()` for mesh UV coordinates**: `uv()` from `three/tsl` returns the mesh's UV attribute as a `vec2` node. Works with standard Three.js geometries that have UV mapping (icosahedron, torus, plane, etc.).
- **`atan(y, x)` for polar angle**: TSL uses `atan(y, x)` as a two-argument function (not `.atan2()` method chaining). Import `atan` from `three/tsl` and call with two args for atan2 behavior.
- **`spherizeUV()` for lens warping**: `spherizeUV(uv, strength)` from `three/tsl` applies barrel/spherical distortion to UV coordinates. Strength values 1-4 give noticeable warping; animating strength with `oscSine` creates a pulsing lens effect.
- **Polar UV kaleidoscope folding**: Convert UVs to polar (`atan`, `length`), divide angle by segment count, `fract()` and mirror with `abs()` to fold, then convert back to cartesian. Creates N-way symmetry from any UV pattern.
- **Multi-stop color gradients via chained `mix`/`smoothstep`**: Chain `mix(a, b, smoothstep(...))` calls for multi-color ramps: `mix(mix(c1, c2, step1), c3, step2)` creates a 3-stop gradient from a single float pattern value.
- **`vec3()` for emissive inline colors**: When `color()` feels heavy, `vec3(r, g, b)` with float components (0-1 range) works for emissive node assignment.
- **Layered halo shells for bloom/glow without post-processing**: Multiple concentric transparent meshes with `THREE.BackSide`, `THREE.AdditiveBlending`, and `depthWrite = false` create convincing bloom halos around a core object. Each shell uses fresnel-driven opacity so edges glow brightest. Scale multipliers of 1.3x, 1.6x, 2.0x give good visual layering.
- **`AdditiveBlending` for light scatter simulation**: Setting `mat.blending = THREE.AdditiveBlending` on transparent halo shells makes overlapping glow regions brighten naturally, simulating real light scatter without post-processing passes.
- **`BackSide` rendering for halos**: Using `mat.side = THREE.BackSide` on halo shells means they render their inner faces, which wrap around the core object and create a glow that appears to emanate outward from the core.
- **Fresnel power tuning per shell layer**: Increasing fresnel `pow()` exponent for outer layers (1.5, 2.0, 2.5) makes outer halos concentrate more at edges while inner halos remain broader, creating natural glow falloff.
- **Reusable material factory functions**: Extracting `makeCoreMaterial()` and `makeHaloMaterial()` as standalone functions with parameters (color, phase, layer index) enables clean composition of multiple instances with different palettes.

## Broken Patterns

- **`If()` / `Discard()` outside Fn context**: `If()` calls `currentStack.If()` which requires an active node builder stack. In React `useMemo`, there is no active stack, so calling `If()` at material construction time throws `TypeError: Cannot read properties of null (reading 'If')`. Even wrapping in `Fn(() => { If(...) })()` does not help because `Fn(callback)()` invokes the callback immediately to build the node graph, but the stack is only active during shader compilation. **Workaround**: Use `alphaTest` + `opacityNode` instead of `If`/`Discard`.
- **Hash noise creates banded patterns**: `hash(positionLocal.mul(N))` on smooth geometry (like a subdivided dodecahedron) creates concentric ring/band patterns rather than salt-and-pepper randomness. This is because `hash()` is deterministic and position varies smoothly across the surface. The banded look is visually interesting but different from typical dissolve effects seen in games.
- **`mat.opacityNode` typed as `Node | null`**: Reading back `mat.opacityNode` after assignment and chaining `.mul()` on it causes TS error `Property 'mul' does not exist on type 'Node'`. Must compose the full opacity expression in local variables before a single assignment.
- **`.atan2()` does not exist on Node**: TSL nodes do not have an `.atan2()` method. Use the standalone `atan(y, x)` function instead. TS will error with "Property 'atan2' does not exist on type 'Node<\"float\">'".

## Visual Quality Notes

- **Dissolve with concentric rings**: The hash-based dissolve on a subdivided dodecahedron creates a layered, almost orbital/scientific visualization look. The concentric teal rings with orange hot edges against the dark background are visually distinctive.
- **Point light through holes**: Placing a bright `pointLight` at origin (inside the mesh) creates a nice "glowing core" effect visible through dissolved holes.
- **Edge emissive intensity**: `edgeGlow.mul(4.0)` on the emissive edge color gives strong enough glow to be clearly visible without washing out.
- **Teal + orange color pairing**: Cool teal base (#1a3344) with hot orange/yellow edges (#ff5500, #ffee88) creates strong contrast and a "burning/disintegrating" feel.
- **Screen-space scanlines on translucent geometry**: Scanlines driven by `screenUV.y` combined with `transparent = true` and moderate base opacity (~0.35) create a convincing holographic/CRT projection look. The scanlines stay fixed to the screen as the object rotates, reinforcing the "projected" illusion.
- **Fresnel rim on hologram**: Fresnel rim glow at `pow(2.0)` with emissive multiplier of 3.0 on cyan creates a strong holographic edge that contrasts well against the dark scanline bands.
- **Layered screen-space modulation**: Combining fine scanlines (freq 200), wide glitch bands (freq 8), and fract-based thin lines at different frequencies creates visual depth and complexity from simple ingredients.
- **Cyan + blue monochrome palette**: Using variations within the cyan-blue spectrum (#00eeff, #0055ff, #aaeeff) with the dark background creates a convincing sci-fi hologram aesthetic.
- **UV kaleidoscope on icosahedron**: Polar UV folding on a subdivided icosahedron creates smooth concentric color zones with subtle symmetry breaks at UV seams. The result is more "enchanted orb" than sharp mandala -- the smooth geometry interpolates UV values, softening the folded pattern edges. Still visually appealing with animated spherize warping.
- **Violet/magenta/gold palette**: Deep violet (#5511aa) center transitioning through magenta (#dd2288) to gold (#ffaa22) at edges creates a rich, jewel-toned look. Pink-tinted lights (#ffaacc, #cc66ff) complement rather than fight the palette.
- **Layered UV patterns**: Combining rings, spokes, diamond grid, and petal patterns at different frequencies with weighted blending creates complexity from simple trigonometric ingredients. Higher ring frequency (60) produces more visible detail than lower (30).
- **Multi-orb glow composition**: Multiple bloom orbs at different positions, sizes, and color palettes with staggered `oscSine` phase offsets create a visually rich scene where each orb pulses independently. Gold, cyan, magenta, green, and violet form a diverse yet harmonious palette against a dark background.
- **Minimal scene lighting for emissive-driven scenes**: When objects provide their own glow via `emissiveNode`, ambient and directional lights should be very low (0.05, 0.2) to let the emissive glow dominate the visual composition.

## Batch History

- **Batch 1, Demo 1 (2026-03-24)**: `noise-dissolve` - Advanced TSL noise functions (hash) with dissolve effect. Dodecahedron with multi-octave hash noise dissolve, burning edges, fresnel rim glow. Used `alphaTest`/`opacityNode` instead of `If`/`Discard` due to stack context limitation.
- **Batch 1, Demo 2 (2026-03-24)**: `screen-hologram` - TSL screenUV / screen-space effects. Holographic icosahedron with screen-space scanlines, glitch bands, fract-based line artifacts, fresnel rim glow, and screen-position color gradient. Demonstrated `screenUV`, `sin`, `fract`, `smoothstep` for layered screen-space modulation.
- **Batch 1, Demo 3 (2026-03-24)**: `uv-kaleidoscope` - TSL texture projection / UV manipulation. Icosahedron with polar UV folding (6-way kaleidoscope symmetry), animated `spherizeUV` warping, layered procedural patterns (rings, spokes, diamond grid, petals), and multi-stop violet/magenta/gold color gradient. Demonstrated `uv()`, `atan(y,x)`, `spherizeUV`, polar-to-cartesian conversion, and chained `mix`/`smoothstep` color ramps.
- **Batch 1, Demo 4 (2026-03-24)**: `bloom-orbs` - Bloom/glow post-processing via TSL. Five floating orbs with layered transparent halo shells simulating bloom entirely through TSL material nodes. Used `AdditiveBlending`, `BackSide` rendering, fresnel-driven opacity, and strong `emissiveNode` to create convincing glow without a post-processing pass. Demonstrated material factory functions, per-layer fresnel tuning, and multi-orb composition with staggered phase.
