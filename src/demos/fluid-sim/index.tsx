import { useMemo, useState, useEffect } from 'react';
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
  time,
  mix,
  smoothstep,
  screenUV,
  floor,
  fract,
  sin,
  cos,
} from 'three/tsl';

/**
 * Fluid Simulation — 2D fluid with GPU compute shaders
 *
 * A 256x256 grid of dye color (vec3) advected by a procedural
 * multi-vortex velocity field computed analytically each frame.
 * Colored ink injected at multiple orbiting source points creates
 * beautiful organic swirling patterns as it flows through the
 * time-varying velocity field.
 *
 * Compute passes per frame:
 * 1. Dye injection: add colored dye at rotating source points
 * 2. Advection: move dye along procedural velocity field (semi-Lagrangian)
 * 3. Diffusion: spread dye to neighbors
 */

const WIDTH = 256;
const TOTAL = WIDTH * WIDTH; // 65536

export default function FluidSim() {
  const { viewport, gl } = useThree();
  const [initialized, setInitialized] = useState(false);

  // ── Compute resources ──
  const compute = useMemo(() => {
    // Double-buffered dye
    const dyeA = instancedArray(TOTAL, 'vec3');
    const dyeB = instancedArray(TOTAL, 'vec3');

    const dtUniform = uniform(0.016);
    const timeUniform = uniform(0.0);
    const widthUniform = float(WIDTH);

    // ── Init: clear buffers ──
    const computeInit = Fn(() => {
      dyeA.element(instanceIndex).assign(vec3(0, 0, 0));
      dyeB.element(instanceIndex).assign(vec3(0, 0, 0));
    })().compute(TOTAL);

    // ── Dye injection: add colored dye at rotating source points ──
    const computeInject = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(widthUniform);
      const gy = floor(idx.div(widthUniform));
      const nx = gx.div(widthUniform);
      const ny = gy.div(widthUniform);

      const t = timeUniform;
      const dt = dtUniform;
      const dye = dyeA.element(instanceIndex);

      // Source 1: wide orbit, magenta/pink
      const s1x = float(0.5).add(sin(t.mul(0.7)).mul(0.35));
      const s1y = float(0.5).add(cos(t.mul(0.9)).mul(0.35));
      const d1 = nx.sub(s1x).mul(nx.sub(s1x)).add(ny.sub(s1y).mul(ny.sub(s1y)));
      const w1 = smoothstep(0.015, 0.0, d1);
      dye.x.addAssign(w1.mul(dt).mul(18.0).mul(0.95));
      dye.y.addAssign(w1.mul(dt).mul(18.0).mul(0.15));
      dye.z.addAssign(w1.mul(dt).mul(18.0).mul(0.75));

      // Source 2: opposite orbit, cyan
      const s2x = float(0.5).add(cos(t.mul(0.6).add(2.0)).mul(0.38));
      const s2y = float(0.5).add(sin(t.mul(0.8).add(1.0)).mul(0.38));
      const d2 = nx.sub(s2x).mul(nx.sub(s2x)).add(ny.sub(s2y).mul(ny.sub(s2y)));
      const w2 = smoothstep(0.015, 0.0, d2);
      dye.x.addAssign(w2.mul(dt).mul(18.0).mul(0.0));
      dye.y.addAssign(w2.mul(dt).mul(18.0).mul(0.85));
      dye.z.addAssign(w2.mul(dt).mul(18.0).mul(1.0));

      // Source 3: figure-8, warm orange-yellow
      const s3x = float(0.5).add(sin(t.mul(1.1)).mul(0.3));
      const s3y = float(0.5).add(sin(t.mul(2.2)).mul(0.22));
      const d3 = nx.sub(s3x).mul(nx.sub(s3x)).add(ny.sub(s3y).mul(ny.sub(s3y)));
      const w3 = smoothstep(0.012, 0.0, d3);
      dye.x.addAssign(w3.mul(dt).mul(18.0).mul(1.0));
      dye.y.addAssign(w3.mul(dt).mul(18.0).mul(0.7));
      dye.z.addAssign(w3.mul(dt).mul(18.0).mul(0.05));

      // Source 4: slow wide orbit, vivid green
      const s4x = float(0.5).add(cos(t.mul(0.4).add(4.0)).mul(0.4));
      const s4y = float(0.5).add(sin(t.mul(0.5).add(3.0)).mul(0.4));
      const d4 = nx.sub(s4x).mul(nx.sub(s4x)).add(ny.sub(s4y).mul(ny.sub(s4y)));
      const w4 = smoothstep(0.012, 0.0, d4);
      dye.x.addAssign(w4.mul(dt).mul(18.0).mul(0.1));
      dye.y.addAssign(w4.mul(dt).mul(18.0).mul(0.95));
      dye.z.addAssign(w4.mul(dt).mul(18.0).mul(0.2));

      // Source 5: center, blue-violet
      const s5x = float(0.5).add(sin(t.mul(1.5)).mul(0.12));
      const s5y = float(0.5).add(cos(t.mul(1.3)).mul(0.12));
      const d5 = nx.sub(s5x).mul(nx.sub(s5x)).add(ny.sub(s5y).mul(ny.sub(s5y)));
      const w5 = smoothstep(0.018, 0.0, d5);
      dye.x.addAssign(w5.mul(dt).mul(15.0).mul(0.3));
      dye.y.addAssign(w5.mul(dt).mul(15.0).mul(0.1));
      dye.z.addAssign(w5.mul(dt).mul(15.0).mul(1.0));
    })().compute(TOTAL);

    // ── Advection: semi-Lagrangian backtracing with procedural velocity field ──
    // The velocity field is computed analytically at each cell position,
    // so the entire grid has velocity (no need for stored velocity buffers)
    const computeAdvect = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(widthUniform);
      const gy = floor(idx.div(widthUniform));
      const nx = gx.div(widthUniform); // [0,1]
      const ny = gy.div(widthUniform);

      const t = timeUniform;

      // ── Procedural multi-vortex velocity field ──
      // Central vortex (gentle, very wide influence)
      const cx1 = nx.sub(0.5);
      const cy1 = ny.sub(0.5);
      const r1 = cx1.mul(cx1).add(cy1.mul(cy1)).max(0.001);
      const v1str = smoothstep(0.5, 0.02, r1).mul(0.4);
      const vx1 = cy1.negate().mul(v1str);
      const vy1 = cx1.mul(v1str);

      // Orbiting vortex A (counter-clockwise, wide orbit, large radius)
      const va_cx = float(0.5).add(sin(t.mul(0.4)).mul(0.32));
      const va_cy = float(0.5).add(cos(t.mul(0.35)).mul(0.32));
      const va_dx = nx.sub(va_cx);
      const va_dy = ny.sub(va_cy);
      const va_r = va_dx.mul(va_dx).add(va_dy.mul(va_dy)).max(0.001);
      const va_str = smoothstep(0.2, 0.0, va_r).mul(0.7);
      const vx2 = va_dy.negate().mul(va_str);
      const vy2 = va_dx.mul(va_str);

      // Orbiting vortex B (clockwise, opposite side, wide)
      const vb_cx = float(0.5).add(cos(t.mul(0.3).add(3.14)).mul(0.35));
      const vb_cy = float(0.5).add(sin(t.mul(0.45).add(1.5)).mul(0.35));
      const vb_dx = nx.sub(vb_cx);
      const vb_dy = ny.sub(vb_cy);
      const vb_r = vb_dx.mul(vb_dx).add(vb_dy.mul(vb_dy)).max(0.001);
      const vb_str = smoothstep(0.18, 0.0, vb_r).mul(0.6);
      // Clockwise: reverse sign
      const vx3 = vb_dy.mul(vb_str);
      const vy3 = vb_dx.negate().mul(vb_str);

      // Orbiting vortex C (medium, creates filaments at edges)
      const vc_cx = float(0.5).add(sin(t.mul(0.8).add(1.0)).mul(0.38));
      const vc_cy = float(0.5).add(cos(t.mul(0.6).add(2.5)).mul(0.38));
      const vc_dx = nx.sub(vc_cx);
      const vc_dy = ny.sub(vc_cy);
      const vc_r = vc_dx.mul(vc_dx).add(vc_dy.mul(vc_dy)).max(0.001);
      const vc_str = smoothstep(0.15, 0.0, vc_r).mul(0.55);
      const vx4 = vc_dy.negate().mul(vc_str);
      const vy4 = vc_dx.mul(vc_str);

      // Strong sinusoidal shear (creates stretching and filaments across viewport)
      const shearX = sin(ny.mul(6.28).add(t.mul(0.5))).mul(0.2)
                     .add(sin(ny.mul(12.56).add(t.mul(0.8))).mul(0.08));
      const shearY = cos(nx.mul(6.28).add(t.mul(0.3))).mul(0.15)
                     .add(cos(nx.mul(12.56).sub(t.mul(0.6))).mul(0.06));

      // Sum velocity field
      const totalVx = vx1.add(vx2).add(vx3).add(vx4).add(shearX);
      const totalVy = vy1.add(vy2).add(vy3).add(vy4).add(shearY);

      // Semi-Lagrangian backtracing
      // vel is in normalized [0,1] space; multiply by WIDTH to get cell displacement
      const dt2 = dtUniform;
      const backX = gx.sub(totalVx.mul(dt2).mul(widthUniform));
      const backY = gy.sub(totalVy.mul(dt2).mul(widthUniform));

      // Clamp
      const clampedX = backX.max(float(0.5)).min(float(WIDTH - 1.5));
      const clampedY = backY.max(float(0.5)).min(float(WIDTH - 1.5));

      // Bilinear interpolation
      const x0 = floor(clampedX);
      const y0 = floor(clampedY);
      const fx = fract(clampedX);
      const fy = fract(clampedY);

      const w = float(WIDTH);
      const maxIdx = float(TOTAL - 1);
      const i00 = y0.mul(w).add(x0);
      const i10 = y0.mul(w).add(x0.add(1.0));
      const i01 = y0.add(1.0).mul(w).add(x0);
      const i11 = y0.add(1.0).mul(w).add(x0.add(1.0));

      const s00 = dyeA.element(int(i00.max(0.0).min(maxIdx)));
      const s10 = dyeA.element(int(i10.max(0.0).min(maxIdx)));
      const s01 = dyeA.element(int(i01.max(0.0).min(maxIdx)));
      const s11 = dyeA.element(int(i11.max(0.0).min(maxIdx)));

      const top = mix(s00, s10, fx);
      const bot = mix(s01, s11, fx);
      const result = mix(top, bot, fy);

      // Slow decay keeps colors vivid
      dyeB.element(instanceIndex).assign(result.mul(0.998));
    })().compute(TOTAL);

    // ── Copy B back to A ──
    const computeCopyDye = Fn(() => {
      dyeA.element(instanceIndex).assign(dyeB.element(instanceIndex));
    })().compute(TOTAL);

    // ── Diffusion: spread dye to neighbors ──
    const computeDiffuse = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(widthUniform);
      const gy = floor(idx.div(widthUniform));
      const w = widthUniform;
      const maxI = float(TOTAL - 1);

      const center = dyeA.element(instanceIndex);
      const left   = dyeA.element(int(gy.mul(w).add(gx.sub(1.0).max(0.0)).min(maxI)));
      const right  = dyeA.element(int(gy.mul(w).add(gx.add(1.0).min(float(WIDTH - 1))).min(maxI)));
      const down   = dyeA.element(int(gy.sub(1.0).max(0.0).mul(w).add(gx).min(maxI)));
      const up     = dyeA.element(int(gy.add(1.0).min(float(WIDTH - 1)).mul(w).add(gx).min(maxI)));

      // 60% center + 10% each neighbor
      const diffused = center.mul(0.6).add(left.mul(0.1)).add(right.mul(0.1)).add(down.mul(0.1)).add(up.mul(0.1));
      dyeB.element(instanceIndex).assign(diffused);
    })().compute(TOTAL);

    return {
      dyeA, dtUniform, timeUniform,
      computeInit, computeInject, computeAdvect,
      computeCopyDye, computeDiffuse,
    };
  }, []);

  // ── Material: read dye buffer, render to screen ──
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const renderDye = Fn(() => {
      const uvX = screenUV.x;
      const uvY = screenUV.y;
      const w = float(WIDTH);

      const gxF = uvX.mul(w).min(float(WIDTH - 1));
      const gyF = uvY.mul(w).min(float(WIDTH - 1));

      // Bilinear interpolation for smooth rendering
      const gx0 = floor(gxF);
      const gy0 = floor(gyF);
      const fx = fract(gxF);
      const fy = fract(gyF);

      const maxIdx = float(TOTAL - 1);
      const i00 = gy0.mul(w).add(gx0);
      const i10 = gy0.mul(w).add(gx0.add(1.0).min(float(WIDTH - 1)));
      const i01 = gy0.add(1.0).min(float(WIDTH - 1)).mul(w).add(gx0);
      const i11 = gy0.add(1.0).min(float(WIDTH - 1)).mul(w).add(gx0.add(1.0).min(float(WIDTH - 1)));

      const c00 = compute.dyeA.element(int(i00.max(0.0).min(maxIdx)));
      const c10 = compute.dyeA.element(int(i10.max(0.0).min(maxIdx)));
      const c01 = compute.dyeA.element(int(i01.max(0.0).min(maxIdx)));
      const c11 = compute.dyeA.element(int(i11.max(0.0).min(maxIdx)));

      const top = mix(c00, c10, fx);
      const bot = mix(c01, c11, fx);
      const dyeColor = mix(top, bot, fy);

      // Boost for vibrancy
      const boosted = dyeColor.mul(2.2);
      // Subtle background glow
      const bgGlow = vec3(
        sin(time.mul(0.3)).mul(0.008).add(0.012),
        sin(time.mul(0.2).add(2.0)).mul(0.006).add(0.008),
        sin(time.mul(0.25).add(4.0)).mul(0.01).add(0.018),
      );

      const finalColor = boosted.add(bgGlow);
      return vec4(finalColor.x, finalColor.y, finalColor.z, float(1.0));
    });

    mat.colorNode = renderDye();
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

  // ── Per-frame compute dispatch ──
  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer || !renderer.compute) return;

    const dt = Math.min(delta, 0.033);
    compute.dtUniform.value = dt;
    compute.timeUniform.value += dt;

    // 1. Inject dye at source points
    renderer.compute(compute.computeInject);

    // 2. Advect dye through procedural velocity field
    renderer.compute(compute.computeAdvect);
    renderer.compute(compute.computeCopyDye);

    // 3. Light diffusion (2 passes)
    renderer.compute(compute.computeDiffuse);
    renderer.compute(compute.computeCopyDye);
    renderer.compute(compute.computeDiffuse);
    renderer.compute(compute.computeCopyDye);
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[viewport.width, viewport.height]} />
    </mesh>
  );
}
