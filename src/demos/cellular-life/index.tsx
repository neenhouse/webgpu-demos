import { useMemo, useState, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  instancedArray,
  instanceIndex,
  uniform,
  float,
  int,
  vec3,
  vec4,
  mix,
  smoothstep,
  screenUV,
  floor,
  fract,
} from 'three/tsl';

/**
 * Cellular Life — Game of Life cellular automaton on a 256x256 grid via compute
 *
 * Double-buffered compute grid: two instancedArray buffers (float per cell).
 * 0.0 = dead, >0 = alive with age tracking.
 * Classic Conway rules: survive with 2-3 neighbors, birth with exactly 3.
 * Update runs once per ~100ms for readable speed.
 * Color mapping: dead=near-black, newly alive=bright green, young=yellow-green,
 * mature=orange, old=deep red/magenta. Faint grid lines via fract.
 */

const WIDTH = 256;
const TOTAL = WIDTH * WIDTH;

export default function CellularLife() {
  const { viewport, gl } = useThree();
  const [initialized, setInitialized] = useState(false);
  const timeAccum = useRef(0);

  const compute = useMemo(() => {
    const cellA = instancedArray(TOTAL, 'float');
    const cellB = instancedArray(TOTAL, 'float');
    const dtUniform = uniform(0.016);
    const widthUniform = float(WIDTH);

    // ── Init: randomly seed ~30% of cells as alive ──
    const computeInit = Fn(() => {
      const idx = float(instanceIndex);
      // Hash function to get pseudo-random value from index
      const h1 = fract(idx.mul(127.1).add(311.7));
      const h2 = fract(h1.mul(h1).mul(43758.5453));
      // Threshold at 0.3 for ~30% alive
      const alive = smoothstep(float(0.29), float(0.31), h2);
      cellA.element(instanceIndex).assign(alive);
      cellB.element(instanceIndex).assign(float(0.0));
    })().compute(TOTAL);

    // ── Compute update: Game of Life rules ──
    const computeStep = Fn(() => {
      const idx = float(instanceIndex);
      const gx = floor(idx.mod(widthUniform));
      const gy = floor(idx.div(widthUniform));
      const w = widthUniform;
      const maxI = float(TOTAL - 1);
      const dt = dtUniform;

      const current = cellA.element(instanceIndex);

      // Count alive neighbors (Moore neighborhood — 8 neighbors)
      // Clamp at edges
      const xm1 = gx.sub(1.0).max(0.0);
      const xp1 = gx.add(1.0).min(float(WIDTH - 1));
      const ym1 = gy.sub(1.0).max(0.0);
      const yp1 = gy.add(1.0).min(float(WIDTH - 1));

      // Helper: cell value > 0 means alive, contribute 1.0
      const nw = smoothstep(float(0.0), float(0.001), cellA.element(int(ym1.mul(w).add(xm1).min(maxI).max(0.0))));
      const n  = smoothstep(float(0.0), float(0.001), cellA.element(int(ym1.mul(w).add(gx).min(maxI).max(0.0))));
      const ne = smoothstep(float(0.0), float(0.001), cellA.element(int(ym1.mul(w).add(xp1).min(maxI).max(0.0))));
      const we = smoothstep(float(0.0), float(0.001), cellA.element(int(gy.mul(w).add(xm1).min(maxI).max(0.0))));
      const ea = smoothstep(float(0.0), float(0.001), cellA.element(int(gy.mul(w).add(xp1).min(maxI).max(0.0))));
      const sw = smoothstep(float(0.0), float(0.001), cellA.element(int(yp1.mul(w).add(xm1).min(maxI).max(0.0))));
      const s  = smoothstep(float(0.0), float(0.001), cellA.element(int(yp1.mul(w).add(gx).min(maxI).max(0.0))));
      const se = smoothstep(float(0.0), float(0.001), cellA.element(int(yp1.mul(w).add(xp1).min(maxI).max(0.0))));

      const neighbors = nw.add(n).add(ne).add(we).add(ea).add(sw).add(s).add(se);

      const isAlive = smoothstep(float(0.0), float(0.001), current);

      // Conway rules via continuous math:
      // Alive cell survives with 2 or 3 neighbors
      // Dead cell births with exactly 3 neighbors
      // neighbors is continuous but effectively integer-valued (each contribution is 0 or 1)
      const survive = isAlive.mul(
        smoothstep(float(1.5), float(2.0), neighbors).mul(
          smoothstep(float(3.5), float(3.0), neighbors),
        ),
      );
      const birth = float(1.0).sub(isAlive).mul(
        smoothstep(float(2.5), float(3.0), neighbors).mul(
          smoothstep(float(3.5), float(3.0), neighbors),
        ),
      );

      // If alive (survive or birth), increment age; otherwise 0
      const staysAlive = survive.add(birth);
      // When surviving, keep age and add dt; when birthing, start at dt
      const newAge = staysAlive.mul(current.mul(survive).add(dt));

      cellB.element(instanceIndex).assign(newAge);
    })().compute(TOTAL);

    // ── Copy B -> A ──
    const computeCopy = Fn(() => {
      cellA.element(instanceIndex).assign(cellB.element(instanceIndex));
    })().compute(TOTAL);

    return { cellA, dtUniform, computeInit, computeStep, computeCopy };
  }, []);

  // ── Material: render grid ──
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const renderGrid = Fn(() => {
      const w = float(WIDTH);

      // Map screenUV to grid coordinates
      const gxF = screenUV.x.mul(w);
      const gyF = screenUV.y.mul(w);

      // Nearest cell index
      const gx = floor(gxF).min(float(WIDTH - 1)).max(0.0);
      const gy = floor(gyF).min(float(WIDTH - 1)).max(0.0);
      const maxIdx = float(TOTAL - 1);
      const cellIdx = gy.mul(w).add(gx).min(maxIdx).max(0.0);

      const age = compute.cellA.element(int(cellIdx));
      const isAlive = smoothstep(float(0.0), float(0.001), age);

      // ── Color mapping based on age ──
      const deadColor = vec3(0.04, 0.04, 0.06);
      const newborn = vec3(0.2, 1.0, 0.3);     // bright green (age < 0.5)
      const young = vec3(0.6, 0.95, 0.15);      // yellow-green (0.5-2)
      const mature = vec3(1.0, 0.6, 0.1);       // orange (2-5)
      const old = vec3(0.85, 0.1, 0.5);         // deep red/magenta (>5)

      // Smoothstep transitions between age bands
      const c1 = mix(newborn, young, smoothstep(float(0.5), float(2.0), age));
      const c2 = mix(c1, mature, smoothstep(float(2.0), float(5.0), age));
      const aliveColor = mix(c2, old, smoothstep(float(5.0), float(10.0), age));

      const cellColor = mix(deadColor, aliveColor, isAlive);

      // ── Faint grid lines ──
      const fx = fract(gxF);
      const fy = fract(gyF);
      // Edge detection: close to 0 or 1 in fract space
      const edgeX = smoothstep(float(0.03), float(0.0), fx).add(
        smoothstep(float(0.97), float(1.0), fx),
      );
      const edgeY = smoothstep(float(0.03), float(0.0), fy).add(
        smoothstep(float(0.97), float(1.0), fy),
      );
      const gridLine = edgeX.add(edgeY).min(1.0).mul(0.08);

      // Darken cell color slightly at grid edges
      const finalColor = mix(cellColor, vec3(0.15, 0.15, 0.2), gridLine);

      return vec4(finalColor, float(1.0));
    });

    mat.colorNode = renderGrid();
    return mat;
  }, [compute]);

  // ── Init compute ──
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer && renderer.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  // ── Per-frame compute dispatch (throttled to ~100ms) ──
  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer || !renderer.compute) return;

    const dt = Math.min(delta, 0.033);
    timeAccum.current += dt;

    // Only step the simulation every ~100ms
    if (timeAccum.current >= 0.1) {
      compute.dtUniform.value = timeAccum.current;
      timeAccum.current = 0;

      renderer.compute(compute.computeStep);
      renderer.compute(compute.computeCopy);
    }
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[viewport.width, viewport.height]} />
    </mesh>
  );
}
