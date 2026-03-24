# Batch Demo Generation — Choo Choo Ralph Spec

## Goal

Generate 10 new WebGPU demos per batch, each targeting an unexplored WebGPU/TSL capability. Learn from each demo to improve subsequent ones.

## Prerequisites

- `pnpm dev` must be running before the per-demo verify loop
- Read `docs/ralph-specs/learnings.md` before starting (skip patterns listed as broken, prefer patterns listed as working)

## Existing Demos (15)

| # | Name | Features Used |
|---|------|--------------|
| 1 | tsl-torus | TSL color, oscSine, fresnel (normalWorld.dot), positionNode displacement |
| 2 | particle-field | InstancedMesh (2000), position-driven color, fresnel emissive, mix() |
| 3 | procedural-terrain | Plane displacement via TSL Fn(), height-based coloring, multi-layer sine |
| 4 | crystal-grid | Instanced icosahedrons, rainbow wave (time + position), metalness/roughness |
| 5 | aurora-waves | Additive blending, translucent ribbons, flowing multi-color |
| 6 | morphing-sphere | Sine-wave vertex displacement, organic blob |
| 7 | neon-rings | Concentric torus, pulsing emissive glow |
| 8 | ocean-surface | Layered wave displacement, glossy/reflective surface |
| 9 | pulse-grid | 400 instanced boxes, expanding circular ripple |
| 10 | spiral-galaxy | 3000 instanced stars, spiral arm positioning |
| 11 | flame-orb | Aggressive flickering, warm emission |
| 12 | dna-helix | Double helix instanced spheres, connecting rungs |
| 13 | wireframe-landscape | Wireframe material, scrolling terrain, neon glow |
| 14 | plasma-globe | Swirling discharge patterns, purple-blue |
| 15 | ribbon-dance | Twisted ribbon geometry, multi-color spiraling |

### Existing Accent Colors (avoid duplicates)
`#0088ff`, `#ff44aa`, `#1a9926`, `#8844ff`, `#00ff88`, `#ff6600`, `#ff00ff`, `#0066cc`, `#1144aa`, `#ffcc44`, `#ff3300`, `#4488ff`, `#00ffff`, `#6600ff`, `#ff2244`

## Concept Generation

Analyze the existing demos above. Identify WebGPU/TSL capabilities NOT yet covered:

**Target capabilities (pick 10):**
- Compute shaders (`storageBuffer`, `computeFn`) — set `requiresWebGPU: true`
- Storage textures — set `requiresWebGPU: true`
- Advanced TSL noise functions (`hash`, `mx_noise_float`, `checker`)
- TSL texture projection / UV manipulation
- Bloom/glow post-processing via TSL
- GPU-driven geometry (buffer geometry from compute)
- Skinned mesh with TSL node overrides
- Multi-material objects (different TSL materials per face group)
- TSL `screenUV` / screen-space effects
- Volumetric/raymarching effects via TSL `Fn()`
- Sprite/billboard particles with TSL
- TSL `viewportSize` / resolution-dependent effects

Generate 10 concepts, each targeting a different capability from this list. Name each demo with a kebab-case slug (e.g., `compute-particles`, `noise-terrain`).

## Reference Template: Simple Demo (~60 lines)

This is the complete source of `src/demos/tsl-torus/index.tsx`:

```tsx
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
} from 'three/tsl';

export default function TslTorus() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Animated blue color
    mat.colorNode = color(0x0088ff).mul(
      oscSine(time.mul(0.5)).mul(0.5).add(0.5),
    );

    // Fresnel rim glow
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });
    mat.emissiveNode = color(0x00ffff).mul(fresnel());

    // Subtle vertex displacement
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(2.0).add(positionLocal.y)).mul(0.03)),
    );

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <mesh ref={meshRef} material={material}>
        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
      </mesh>
    </>
  );
}
```

## Reference Template: Complex Demo (~150 lines)

This is the complete source of `src/demos/particle-field/index.tsx`:

```tsx
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  positionLocal,
  normalLocal,
  Fn,
  float,
  mix,
} from 'three/tsl';

const PARTICLE_COUNT = 2000;
const GRID_SIZE = 13;
const SPREAD = 6;

export default function ParticleField() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];
    let count = 0;

    for (let ix = 0; ix < GRID_SIZE && count < PARTICLE_COUNT; ix++) {
      for (let iy = 0; iy < GRID_SIZE && count < PARTICLE_COUNT; iy++) {
        for (let iz = 0; iz < GRID_SIZE && count < PARTICLE_COUNT; iz++) {
          const x =
            ((ix / (GRID_SIZE - 1)) - 0.5) * SPREAD +
            (Math.random() - 0.5) * 0.3;
          const y =
            ((iy / (GRID_SIZE - 1)) - 0.5) * SPREAD +
            (Math.random() - 0.5) * 0.3;
          const z =
            ((iz / (GRID_SIZE - 1)) - 0.5) * SPREAD +
            (Math.random() - 0.5) * 0.3;

          const scale = 0.03 + Math.random() * 0.04;

          dummy.position.set(x, y, z);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          result.push(dummy.matrix.clone());
          count++;
        }
      }
    }

    return result;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const posW = positionWorld;
    const t = time.mul(0.3);

    const r = oscSine(posW.x.mul(0.8).add(t)).mul(0.5).add(0.5);
    const g = oscSine(posW.y.mul(0.8).add(t.mul(1.3))).mul(0.5).add(0.5);
    const b = oscSine(posW.z.mul(0.8).add(t.mul(0.7))).mul(0.5).add(0.5);

    const base = color(0x00ccff);
    const gradientFactor = float(1.0)
      .sub(r.mul(0.3))
      .add(g.mul(0.5))
      .add(b.mul(0.2));
    const gradient = color(0xffffff).mul(gradientFactor);
    const blendFactor = oscSine(t.mul(0.5)).mul(0.5).add(0.5);
    mat.colorNode = mix(base, gradient, blendFactor);

    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    const emissiveColor = Fn(() => {
      const magenta = color(0xff00ff);
      const cyan = color(0x00ffff);
      const blend = oscSine(time.mul(0.2)).mul(0.5).add(0.5);
      return mix(magenta, cyan, blend);
    });

    mat.emissiveNode = emissiveColor().mul(fresnel()).mul(float(1.5));

    mat.positionNode = positionLocal.add(
      normalLocal.mul(
        oscSine(time.mul(1.5).add(positionLocal.y.mul(4.0))).mul(0.015),
      ),
    );

    mat.roughness = 0.4;
    mat.metalness = 0.6;

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
      groupRef.current.rotation.x += delta * 0.03;
    }
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[8, 10, 5]} intensity={1.2} color={0xffffff} />
      <directionalLight position={[-5, -3, -8]} intensity={0.4} color={0x8888ff} />
      <pointLight position={[0, 0, 0]} intensity={2} color={0x00ffff} distance={12} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
        >
          <sphereGeometry args={[1, 8, 6]} />
        </instancedMesh>
      </group>
    </>
  );
}
```

## Registry Entry Pattern

Each new demo needs an entry appended to the `demos` array in `src/lib/registry.ts`:

```tsx
{
  name: '<kebab-case-name>',
  title: '<Human Readable Title>',
  description: '<One-line description of the visual effect>',
  requiresWebGPU: false, // true only for compute shaders or storage buffers
  color: '<hex accent color, distinct from existing colors>',
  component: lazy(() => import('../demos/<kebab-case-name>')),
},
```

## Per-Demo Task Loop

For each of the 10 concepts:

### 1. Create the demo file
Create `src/demos/<name>/index.tsx` following the reference templates above:
- Single default export React component
- Import from `'three/webgpu'` and `'three/tsl'`
- Material built in `useMemo()` with `MeshStandardNodeMaterial`
- Animation via `useFrame()`
- Self-contained (no shared state, no external dependencies beyond Three.js/R3F)

### 2. Register in registry
Append entry to `src/lib/registry.ts` with all fields. Choose a distinct accent color.

### 3. Verify build
Run: `pnpm build`
Must compile with zero errors. If it fails, go to Quality Gate.

### 4. Verify render
Open `http://localhost:5173/#<name>` in a browser (Playwright).
Take a screenshot. Confirm it is NOT:
- A black screen
- An error message
- A blank white page
If it fails, go to Quality Gate.

### 5. Generate thumbnail
Capture a screenshot of the running demo and save to `public/thumbnails/<name>.jpg` (served by Vite as `/thumbnails/<name>.jpg`).

### 6. Update learnings
After each demo (success or failure), update `docs/ralph-specs/learnings.md`:

**Record under "Working Patterns":**
- Which TSL nodes/APIs rendered correctly
- Which parameter ranges produced good visuals
- Effective color/animation combinations

**Record under "Broken Patterns":**
- APIs that threw errors (with the error message)
- TSL nodes that didn't work as expected
- Three.js WebGPU features that aren't ready in v0.183

**Record under "Visual Quality Notes":**
- What made a demo visually striking vs. bland
- Animation speed sweet spots
- Lighting configurations that worked well

### 7. Read learnings before next demo
Before starting the next demo, re-read `docs/ralph-specs/learnings.md`. Avoid broken patterns. Build on working patterns. Apply visual quality insights.

## Quality Gate

If a demo fails build or renders incorrectly:

- **Attempt 1**: Fix based on the error message
- **Attempt 2**: Simplify — fall back to the simple demo template (tsl-torus pattern) using the same concept's title and color, using ONLY TSL nodes listed as "Working" in the learnings file
- **If still failing**: Skip this demo. Record the failure (concept name, error, root cause) in learnings under "Broken Patterns". Move to the next concept. Do NOT spend more than 2 attempts.

## Batch Summary

After all 10 concepts are attempted, output:

```
## Batch N Summary (YYYY-MM-DD)

### Created (X/10)
| Name | Title | requiresWebGPU | Color |
|------|-------|---------------|-------|
| ... | ... | ... | ... |

### Skipped (Y/10)
| Name | Reason |
|------|--------|
| ... | ... |

### Key Learnings
- ...

### Total Demo Count: {existing + new}
```

Also append this summary to `docs/ralph-specs/learnings.md` under "Batch History".
