# Batch Demo Learnings

## Last updated: 2026-03-24

## Working Patterns

- **`hash()` for dissolve noise**: `hash(positionLocal.mul(N))` generates position-based pseudo-random values. Different multiplier values (25, 67, 143) create different frequency patterns. Blending multiple hash octaves (`noise1.mul(0.5).add(noise2.mul(0.3)).add(noise3.mul(0.2))`) produces more interesting visual variety than a single hash call.
- **`smoothstep()` for edge detection**: `smoothstep(threshold, threshold.add(width), noise)` creates a soft transition band at the dissolve edge. Width of 0.08-0.1 gives a good visible edge glow region.
- **`alphaTest` for fragment discard**: Using `mat.transparent = true` + `mat.alphaTest = 0.5` + `mat.opacityNode = smoothstep(...)` is the correct pattern for discarding fragments in React/R3F context. Direct `If()`/`Discard()` calls fail because `currentStack` is null outside shader compilation context.
- **`mix()` for color blending**: Combining base colors with edge colors using `mix(baseColor, edgeColor, edgeGlow.pow(0.6))` works well for smooth transitions.
- **`Fn()` for fresnel**: Wrapping fresnel calculation in `Fn(() => { ... })` and calling with `fresnel()` works correctly for grouping node computations.
- **`DoubleSide` for dissolve effects**: Setting `mat.side = THREE.DoubleSide` is essential for dissolve effects so backfaces of the geometry are visible through the dissolved holes.

## Broken Patterns

- **`If()` / `Discard()` outside Fn context**: `If()` calls `currentStack.If()` which requires an active node builder stack. In React `useMemo`, there is no active stack, so calling `If()` at material construction time throws `TypeError: Cannot read properties of null (reading 'If')`. Even wrapping in `Fn(() => { If(...) })()` does not help because `Fn(callback)()` invokes the callback immediately to build the node graph, but the stack is only active during shader compilation. **Workaround**: Use `alphaTest` + `opacityNode` instead of `If`/`Discard`.
- **Hash noise creates banded patterns**: `hash(positionLocal.mul(N))` on smooth geometry (like a subdivided dodecahedron) creates concentric ring/band patterns rather than salt-and-pepper randomness. This is because `hash()` is deterministic and position varies smoothly across the surface. The banded look is visually interesting but different from typical dissolve effects seen in games.

## Visual Quality Notes

- **Dissolve with concentric rings**: The hash-based dissolve on a subdivided dodecahedron creates a layered, almost orbital/scientific visualization look. The concentric teal rings with orange hot edges against the dark background are visually distinctive.
- **Point light through holes**: Placing a bright `pointLight` at origin (inside the mesh) creates a nice "glowing core" effect visible through dissolved holes.
- **Edge emissive intensity**: `edgeGlow.mul(4.0)` on the emissive edge color gives strong enough glow to be clearly visible without washing out.
- **Teal + orange color pairing**: Cool teal base (#1a3344) with hot orange/yellow edges (#ff5500, #ffee88) creates strong contrast and a "burning/disintegrating" feel.

## Batch History

- **Batch 1, Demo 1 (2026-03-24)**: `noise-dissolve` - Advanced TSL noise functions (hash) with dissolve effect. Dodecahedron with multi-octave hash noise dissolve, burning edges, fresnel rim glow. Used `alphaTest`/`opacityNode` instead of `If`/`Discard` due to stack context limitation.
