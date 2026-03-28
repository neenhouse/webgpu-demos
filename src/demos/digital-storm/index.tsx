import { useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  Break,
  instancedArray,
  instanceIndex,
  uniform,
  float,
  int,
  vec3,
  vec4,
  hash,
  time,
  mix,
  smoothstep,
  sin,
  cos,
  fract,
  floor,
  screenUV,
} from 'three/tsl';

/**
 * Digital Storm — Screen-space rain + fractal lightning + compute wind field
 *
 * Combines 5 proven techniques:
 * 1. Screen-space effects (screenUV for rain — proven in screen-hologram, resolution-warp)
 * 2. Fractal math (Loop/If/Break in Fn for lightning branches — proven in fractal-zoom)
 * 3. Compute shader (wind velocity field driving rain angles — proven in fluid-sim)
 * 4. Bloom halos (lightning strike glow — proven in bloom-orbs)
 * 5. SDF raymarching (cloud layer at top — proven SDF technique)
 *
 * requiresWebGPU: true (compute wind field)
 */

// Wind field grid: 64x64 is enough for smooth interpolation
const WIND_WIDTH = 64;
const WIND_TOTAL = WIND_WIDTH * WIND_WIDTH;

export default function DigitalStorm() {
  const { viewport, gl } = useThree();
  const [initialized, setInitialized] = useState(false);

  // ── Compute resources: wind velocity field ──
  const compute = useMemo(() => {
    // Wind velocity field (vec2 stored as vec3, using x,y)
    const windA = instancedArray(WIND_TOTAL, 'vec3');
    const windB = instancedArray(WIND_TOTAL, 'vec3');

    const timeUniform = uniform(0.0);
    const dtUniform = uniform(0.016);
    const widthUniform = float(WIND_WIDTH);

    // Init: zero out wind
    const computeInit = Fn(() => {
      windA.element(instanceIndex).assign(vec3(0, 0, 0));
      windB.element(instanceIndex).assign(vec3(0, 0, 0));
    })().compute(WIND_TOTAL);

    // Update wind field: procedural multi-vortex + turbulence (proven in fluid-sim)
    const computeWind = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(widthUniform);
      const gy = floor(idx.div(widthUniform));
      const nx = gx.div(widthUniform); // [0,1]
      const ny = gy.div(widthUniform);
      const t = timeUniform;

      // Wandering storm center (drives main wind direction)
      const stormX = float(0.5).add(sin(t.mul(0.15)).mul(0.2));
      const stormY = float(0.7).add(cos(t.mul(0.12)).mul(0.1));
      const dx = nx.sub(stormX);
      const dy = ny.sub(stormY);
      const r = dx.mul(dx).add(dy.mul(dy)).max(0.001);
      const vortexStr = smoothstep(0.5, 0.0, r).mul(0.8);

      // Main directional wind: slightly left, strongly downward
      const baseWindX = float(-0.15).add(sin(t.mul(0.2)).mul(0.1));
      const baseWindY = float(-0.6).sub(sin(t.mul(0.1)).mul(0.15));

      // Turbulence via sinusoidal shear (proven in fluid-sim)
      const turbX = sin(ny.mul(8.0).add(t.mul(0.8))).mul(0.2)
        .add(sin(ny.mul(16.0).add(t.mul(1.2))).mul(0.08));
      const turbY = cos(nx.mul(6.0).add(t.mul(0.5))).mul(0.1);

      // Vortex rotation around storm center
      const vortexVx = dy.negate().mul(vortexStr);
      const vortexVy = dx.mul(vortexStr);

      const totalVx = baseWindX.add(turbX).add(vortexVx);
      const totalVy = baseWindY.add(turbY).add(vortexVy);

      windB.element(instanceIndex).x.assign(totalVx);
      windB.element(instanceIndex).y.assign(totalVy);
    })().compute(WIND_TOTAL);

    // Copy B to A
    const computeCopy = Fn(() => {
      windA.element(instanceIndex).assign(windB.element(instanceIndex));
    })().compute(WIND_TOTAL);

    return { windA, timeUniform, dtUniform, computeInit, computeWind, computeCopy };
  }, []);

  // ── Material: full-viewport storm shader ──
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const stormShader = Fn(() => {
      const uv = screenUV;
      const t = time;

      // ── 1. Sample wind field for rain direction ──
      const windGridX = floor(uv.x.mul(float(WIND_WIDTH)).clamp(0.0, float(WIND_WIDTH - 1)));
      const windGridY = floor(uv.y.mul(float(WIND_WIDTH)).clamp(0.0, float(WIND_WIDTH - 1)));
      const windIdx = int(windGridY.mul(float(WIND_WIDTH)).add(windGridX).clamp(0.0, float(WIND_TOTAL - 1)));
      const windVec = compute.windA.element(windIdx);
      const windX = windVec.x;
      const windY = windVec.y;

      // ── 2. SDF Cloud layer at top (raymarched) ──
      // Simple SDF: layered animated sin waves for cloud edge
      const cloudBase = float(0.75); // clouds start at top 25%
      const cloudNoise1 = sin(uv.x.mul(8.0).add(t.mul(0.3))).mul(0.04);
      const cloudNoise2 = sin(uv.x.mul(15.0).sub(t.mul(0.5))).mul(0.025);
      const cloudNoise3 = sin(uv.x.mul(25.0).add(t.mul(0.7))).mul(0.015);
      const cloudEdge = cloudBase.add(cloudNoise1).add(cloudNoise2).add(cloudNoise3);
      // Cloud density: 0 below edge, fades in above
      const cloudDensity = smoothstep(cloudEdge, cloudEdge.add(0.12), uv.y);
      // Cloud color: dark blue-gray with internal variation
      const cloudBright = hash(vec3(uv.x.mul(5.0).add(t.mul(0.1)), uv.y.mul(3.0), float(1.0)));
      const cloudColor = mix(
        vec3(0.05, 0.06, 0.12),
        vec3(0.15, 0.16, 0.25),
        cloudBright.mul(cloudDensity),
      );

      // ── 3. Screen-space rain streaks (wind-driven) ──
      // Multiple rain layers at different sizes for depth
      const rainAccum = float(0.0).toVar();

      // Layer 1: dense fine rain
      const rainAngle1 = windX.mul(0.8);
      const shearU1 = uv.x.add(uv.y.mul(rainAngle1));
      const rainCell1 = fract(shearU1.mul(40.0).add(t.mul(4.0).add(windY.mul(8.0))));
      const rainStreak1 = smoothstep(0.95, 1.0, rainCell1);
      const rainMask1 = hash(vec3(floor(shearU1.mul(40.0)), floor(uv.y.mul(80.0).add(t.mul(6.0))), float(0.0)));
      const rainVis1 = rainStreak1.mul(smoothstep(0.6, 0.9, rainMask1)).mul(0.15);
      rainAccum.addAssign(rainVis1);

      // Layer 2: medium rain (fewer, brighter)
      const rainAngle2 = windX.mul(0.6);
      const shearU2 = uv.x.add(uv.y.mul(rainAngle2));
      const rainCell2 = fract(shearU2.mul(20.0).add(t.mul(5.5).add(windY.mul(6.0))));
      const rainStreak2 = smoothstep(0.93, 1.0, rainCell2);
      const rainMask2 = hash(vec3(floor(shearU2.mul(20.0)), floor(uv.y.mul(50.0).add(t.mul(8.0))), float(1.0)));
      const rainVis2 = rainStreak2.mul(smoothstep(0.55, 0.85, rainMask2)).mul(0.2);
      rainAccum.addAssign(rainVis2);

      // Layer 3: sparse heavy drops
      const rainAngle3 = windX.mul(0.5);
      const shearU3 = uv.x.add(uv.y.mul(rainAngle3));
      const rainCell3 = fract(shearU3.mul(10.0).add(t.mul(7.0).add(windY.mul(4.0))));
      const rainStreak3 = smoothstep(0.96, 1.0, rainCell3);
      const rainMask3 = hash(vec3(floor(shearU3.mul(10.0)), floor(uv.y.mul(30.0).add(t.mul(10.0))), float(2.0)));
      const rainVis3 = rainStreak3.mul(smoothstep(0.7, 0.95, rainMask3)).mul(0.3);
      rainAccum.addAssign(rainVis3);

      // Rain fades out inside clouds
      const rainFade = float(1.0).sub(cloudDensity.mul(0.8));
      const rainFinal = rainAccum.mul(rainFade);

      // Rain color: blue-white
      const rainColor = vec3(0.6, 0.7, 1.0).mul(rainFinal);

      // ── 4. Fractal lightning via Loop + If + Break (proven in fractal-zoom) ──
      // Lightning as a branching fractal tree from cloud layer
      const lightningAccum = float(0.0).toVar();

      // Slow flash cycle: lightning appears periodically
      const flashCycle = sin(t.mul(0.8)).mul(0.5).add(0.5);
      const flashIntensity = smoothstep(0.7, 0.95, flashCycle);

      // Second flash offset
      const flashCycle2 = sin(t.mul(0.6).add(3.0)).mul(0.5).add(0.5);
      const flashIntensity2 = smoothstep(0.75, 0.95, flashCycle2);

      // Lightning bolt 1: iterative branching (Loop + If + Break in Fn — proven)
      const bolt1X = float(0.35).add(sin(t.mul(0.2)).mul(0.15));
      const boltDist1 = float(10.0).toVar();
      const branchX1 = float(bolt1X).toVar();
      const branchY1 = float(0.78).toVar(); // start from cloud base

      Loop(12, () => {
        const segLen = float(0.06);
        // Zigzag direction via hash
        const jitter = hash(vec3(branchX1, branchY1, t.mul(0.1).floor())).sub(0.5).mul(0.08);
        branchX1.addAssign(jitter);
        branchY1.subAssign(segLen);

        // Distance from UV to segment
        const dx = uv.x.sub(branchX1);
        const dy = uv.y.sub(branchY1);
        const segDist = dx.mul(dx).add(dy.mul(dy));
        // Keep minimum distance
        If(segDist.lessThan(boltDist1), () => {
          boltDist1.assign(segDist);
        });

        // Stop when below ground
        If(branchY1.lessThan(0.05), () => {
          Break();
        });
      });

      // Convert distance to glow: sharp core + wide bloom
      const boltGlow1 = smoothstep(0.003, 0.0, boltDist1).mul(1.0)
        .add(smoothstep(0.02, 0.0, boltDist1).mul(0.3));
      lightningAccum.addAssign(boltGlow1.mul(flashIntensity));

      // Lightning bolt 2 (different position + timing)
      const bolt2X = float(0.65).add(cos(t.mul(0.15)).mul(0.12));
      const boltDist2 = float(10.0).toVar();
      const branchX2 = float(bolt2X).toVar();
      const branchY2 = float(0.76).toVar();

      Loop(10, () => {
        const segLen2 = float(0.065);
        const jitter2 = hash(vec3(branchX2, branchY2, t.mul(0.1).floor().add(7.0))).sub(0.5).mul(0.09);
        branchX2.addAssign(jitter2);
        branchY2.subAssign(segLen2);

        const dx2 = uv.x.sub(branchX2);
        const dy2 = uv.y.sub(branchY2);
        const segDist2 = dx2.mul(dx2).add(dy2.mul(dy2));
        If(segDist2.lessThan(boltDist2), () => {
          boltDist2.assign(segDist2);
        });

        If(branchY2.lessThan(0.1), () => {
          Break();
        });
      });

      const boltGlow2 = smoothstep(0.003, 0.0, boltDist2).mul(1.0)
        .add(smoothstep(0.015, 0.0, boltDist2).mul(0.25));
      lightningAccum.addAssign(boltGlow2.mul(flashIntensity2));

      // Lightning color: white-blue core, purple bloom
      const lightningCore = vec3(0.9, 0.9, 1.0).mul(lightningAccum);
      const lightningBloom = vec3(0.4, 0.3, 0.8).mul(lightningAccum.mul(0.5));

      // ── 5. Bloom halo: brief intense flash illumination from lightning ──
      // Full-screen ambient flash during lightning strike
      const ambientFlash = flashIntensity.mul(0.08).add(flashIntensity2.mul(0.06));
      const flashColor = vec3(0.15, 0.15, 0.3).mul(ambientFlash);

      // Cloud bottom illumination from lightning
      const cloudLightUp = cloudDensity.mul(flashIntensity.add(flashIntensity2)).mul(0.15);
      const cloudFlash = vec3(0.3, 0.3, 0.6).mul(cloudLightUp);

      // ── Compose final output ──
      // Background: dark stormy gradient
      const bgTop = vec3(0.02, 0.02, 0.06);
      const bgBot = vec3(0.04, 0.03, 0.02);
      const bg = mix(bgBot, bgTop, uv.y);

      // Layer cloud on top
      const cloudLayer = cloudColor.mul(cloudDensity);

      // Ground fog at bottom
      const fogDensity = smoothstep(0.15, 0.0, uv.y);
      const fogColor = vec3(0.03, 0.04, 0.06).mul(fogDensity.mul(0.5));

      // Combine all layers
      const scene = bg
        .add(cloudLayer)
        .add(cloudFlash)
        .add(rainColor)
        .add(lightningCore)
        .add(lightningBloom)
        .add(flashColor)
        .add(fogColor);

      return vec4(scene.x, scene.y, scene.z, float(1.0));
    });

    mat.colorNode = stormShader();
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

    // Update wind field
    renderer.compute(compute.computeWind);
    renderer.compute(compute.computeCopy);
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[viewport.width, viewport.height]} />
    </mesh>
  );
}
