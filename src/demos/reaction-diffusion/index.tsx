import { useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  instancedArray,
  instanceIndex,
  float,
  int,
  vec2,
  vec4,
  vec3,
  mix,
  smoothstep,
  screenUV,
  floor,
  hash,
  time,
  sin,
} from 'three/tsl';

/**
 * Reaction-Diffusion -- Gray-Scott model producing organic Turing patterns
 *
 * A 256x256 double-buffered compute grid with two chemical species A and B.
 * Gray-Scott update rule with 5-point Laplacian stencil:
 *   dA = Da * laplacianA - A*B*B + f*(1-A)
 *   dB = Db * laplacianB + A*B*B - (k+f)*B
 *
 * Parameters: Da=1.0, Db=0.5, f=0.055, k=0.062 (coral/spot pattern)
 * Seeded with A=1 everywhere, random B patches.
 * Color: B concentration mapped to dark blue -> cyan -> white -> yellow.
 * Runs 8 simulation steps per frame for faster evolution.
 *
 * Additional: vignette overlay, animated border glow halo, 3 colored
 * atmosphere point lights, background color tint.
 */

const WIDTH = 256;
const TOTAL = WIDTH * WIDTH;

export default function ReactionDiffusion() {
  const { viewport, gl } = useThree();
  const [initialized, setInitialized] = useState(false);

  const compute = useMemo(() => {
    // Double-buffered: each cell stores vec2(A, B)
    const gridA = instancedArray(TOTAL, 'vec2');
    const gridB = instancedArray(TOTAL, 'vec2');

    const widthUniform = float(WIDTH);

    // Gray-Scott parameters
    const Da = float(1.0);
    const Db = float(0.5);
    const feedRate = float(0.055);
    const killRate = float(0.062);
    const dtSim = float(1.0); // simulation timestep

    // ── Init: A=1 everywhere, B=0, then seed ~20 random B patches ──
    const computeInit = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(widthUniform);
      const gy = floor(idx.div(widthUniform));

      // Start with A=1, B=0
      const cellA = float(1.0).toVar();
      const cellB = float(0.0).toVar();

      // Seed ~20 spots by hashing instanceIndex to determine proximity to seed centers
      const seedCount = 20;
      for (let s = 0; s < seedCount; s++) {
        const seedCenterX = hash(float(s).mul(7.31)).mul(widthUniform);
        const seedCenterY = hash(float(s).mul(13.17).add(0.5)).mul(widthUniform);
        const dx = gx.sub(seedCenterX);
        const dy = gy.sub(seedCenterY);
        const dist = dx.mul(dx).add(dy.mul(dy));
        // Seed radius ~5 cells -> dist < 25
        If(dist.lessThan(25.0), () => {
          cellB.assign(1.0);
        });
      }

      gridA.element(instanceIndex).assign(vec2(cellA, cellB));
      gridB.element(instanceIndex).assign(vec2(cellA, cellB));
    })().compute(TOTAL);

    // ── Simulation step: read from gridA, write to gridB ──
    const computeStep = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(widthUniform);
      const gy = floor(idx.div(widthUniform));
      const w = widthUniform;
      const maxI = float(TOTAL - 1);

      const center = gridA.element(instanceIndex);
      const centerA = center.x;
      const centerB = center.y;

      // 5-point Laplacian stencil (clamped at boundaries)
      const left = gridA.element(int(gy.mul(w).add(gx.sub(1.0).max(0.0)).min(maxI)));
      const right = gridA.element(int(gy.mul(w).add(gx.add(1.0).min(float(WIDTH - 1))).min(maxI)));
      const down = gridA.element(int(gy.sub(1.0).max(0.0).mul(w).add(gx).min(maxI)));
      const up = gridA.element(int(gy.add(1.0).min(float(WIDTH - 1)).mul(w).add(gx).min(maxI)));

      const laplacianA = left.x.add(right.x).add(down.x).add(up.x).sub(centerA.mul(4.0));
      const laplacianB = left.y.add(right.y).add(down.y).add(up.y).sub(centerB.mul(4.0));

      // Gray-Scott update
      const abb = centerA.mul(centerB).mul(centerB);
      const newA = centerA.add(
        Da.mul(laplacianA).sub(abb).add(feedRate.mul(float(1.0).sub(centerA))).mul(dtSim),
      );
      const newB = centerB.add(
        Db.mul(laplacianB).add(abb).sub(killRate.add(feedRate).mul(centerB)).mul(dtSim),
      );

      // Clamp to [0,1]
      gridB.element(instanceIndex).assign(
        vec2(newA.max(0.0).min(1.0), newB.max(0.0).min(1.0)),
      );
    })().compute(TOTAL);

    // ── Copy B back to A ──
    const computeCopy = Fn(() => {
      gridA.element(instanceIndex).assign(gridB.element(instanceIndex));
    })().compute(TOTAL);

    return {
      gridA,
      computeInit,
      computeStep,
      computeCopy,
    };
  }, []);

  // ── Material: map B concentration to color gradient ──
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const renderColor = Fn(() => {
      const uvX = screenUV.x;
      const uvY = screenUV.y;
      const w = float(WIDTH);

      const gx = uvX.mul(w).min(float(WIDTH - 1));
      const gy = uvY.mul(w).min(float(WIDTH - 1));
      const idx = floor(gy).mul(w).add(floor(gx));
      const maxIdx = float(TOTAL - 1);

      const cell = compute.gridA.element(int(idx.max(0.0).min(maxIdx)));
      const b = cell.y;

      // 5-stop Color gradient: dark blue -> cyan -> white -> yellow -> orange
      const darkBlue = vec4(0.02, 0.02, 0.15, 1.0);
      const cyan = vec4(0.0, 0.7, 0.85, 1.0);
      const white = vec4(1.0, 1.0, 1.0, 1.0);
      const yellow = vec4(1.0, 0.9, 0.2, 1.0);
      const orange = vec4(1.0, 0.45, 0.05, 1.0);

      const c1 = mix(darkBlue, cyan, smoothstep(0.0, 0.15, b));
      const c2 = mix(c1, white, smoothstep(0.15, 0.35, b));
      const c3 = mix(c2, yellow, smoothstep(0.35, 0.6, b));
      const c4 = mix(c3, orange, smoothstep(0.6, 0.85, b));

      // Vignette darkening at edges
      const uCentered = uvX.sub(float(0.5));
      const vCentered = uvY.sub(float(0.5));
      const r = uCentered.mul(uCentered).add(vCentered.mul(vCentered)).sqrt();
      const vignette = smoothstep(float(0.7), float(0.3), r);

      return vec4(vec3(c4.x, c4.y, c4.z).mul(vignette), float(1.0));
    });

    mat.colorNode = renderColor();
    return mat;
  }, [compute]);

  // Animated border glow halo
  const haloMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const uCentered = screenUV.x.sub(float(0.5));
      const vCentered = screenUV.y.sub(float(0.5));
      const r = uCentered.mul(uCentered).add(vCentered.mul(vCentered)).sqrt();
      // Glow at edges
      const edgeGlow = smoothstep(float(0.3), float(0.5), r).mul(float(0.05));
      const pulse = sin(time.mul(0.7)).mul(float(0.3)).add(float(0.7));
      return vec3(0.0, 0.6, 0.9).mul(edgeGlow).mul(pulse);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // ── Init compute ──
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  // ── Per-frame: run 8 simulation steps ──
  useFrame(() => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer || !renderer.compute) return;

    const stepsPerFrame = 8;
    for (let i = 0; i < stepsPerFrame; i++) {
      renderer.compute(compute.computeStep);
      renderer.compute(compute.computeCopy);
    }
  });

  return (
    <>
      <color attach="background" args={['#010112']} />
      {/* Atmosphere lights */}
      <pointLight position={[-3, 2, 2]} intensity={1.5} color="#0044ff" distance={15} />
      <pointLight position={[3, -2, 2]} intensity={1.2} color="#00aacc" distance={12} />
      <pointLight position={[0, 3, -2]} intensity={1.0} color="#ffcc00" distance={10} />

      <mesh material={material}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>

      {/* Border glow halo */}
      <mesh material={haloMat} position={[0, 0, -0.1]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
      </mesh>
    </>
  );
}
