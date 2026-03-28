import { useRef, useMemo, useState, useEffect } from 'react';
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
  hash,
} from 'three/tsl';

/**
 * Terrain Erosion — Heightmap terrain with hydraulic erosion via compute
 *
 * 128x128 grid with double-buffered height and water fields.
 * Compute passes: rain, erosion+flow, evaporation, copy B->A.
 * Rendered as full-viewport color map reading from height + water buffers.
 */

const WIDTH = 128;
const TOTAL = WIDTH * WIDTH; // 16384

export default function TerrainErosion() {
  const { viewport, gl } = useThree();
  const [initialized, setInitialized] = useState(false);

  // ── Compute resources ──
  const compute = useMemo(() => {
    // Double-buffered height
    const heightA = instancedArray(TOTAL, 'float');
    const heightB = instancedArray(TOTAL, 'float');
    // Double-buffered water
    const waterA = instancedArray(TOTAL, 'float');
    const waterB = instancedArray(TOTAL, 'float');

    const timeUniform = uniform(0.0);
    const frameUniform = uniform(0.0);
    const w = float(WIDTH);
    const maxIdx = float(TOTAL - 1);

    // ── Init: multi-octave noise terrain, zero water ──
    const computeInit = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(w);
      const gy = floor(idx.div(w));
      const nx = gx.div(w);
      const ny = gy.div(w);

      // Multi-octave hash noise for terrain
      // Octave 1: broad hills
      const h1 = hash(floor(nx.mul(4.0)).add(floor(ny.mul(4.0)).mul(137.0)));
      const h1b = hash(floor(nx.mul(4.0)).add(1.0).add(floor(ny.mul(4.0)).mul(137.0)));
      const h1c = hash(floor(nx.mul(4.0)).add(floor(ny.mul(4.0).add(1.0)).mul(137.0)));
      const h1d = hash(floor(nx.mul(4.0)).add(1.0).add(floor(ny.mul(4.0).add(1.0)).mul(137.0)));
      const fx1 = fract(nx.mul(4.0));
      const fy1 = fract(ny.mul(4.0));
      const top1 = mix(h1, h1b, fx1);
      const bot1 = mix(h1c, h1d, fx1);
      const oct1 = mix(top1, bot1, fy1).mul(1.0);

      // Octave 2: medium detail
      const h2 = hash(floor(nx.mul(8.0)).add(floor(ny.mul(8.0)).mul(271.0)).add(42.0));
      const h2b = hash(floor(nx.mul(8.0)).add(1.0).add(floor(ny.mul(8.0)).mul(271.0)).add(42.0));
      const h2c = hash(floor(nx.mul(8.0)).add(floor(ny.mul(8.0).add(1.0)).mul(271.0)).add(42.0));
      const h2d = hash(floor(nx.mul(8.0)).add(1.0).add(floor(ny.mul(8.0).add(1.0)).mul(271.0)).add(42.0));
      const fx2 = fract(nx.mul(8.0));
      const fy2 = fract(ny.mul(8.0));
      const top2 = mix(h2, h2b, fx2);
      const bot2 = mix(h2c, h2d, fx2);
      const oct2 = mix(top2, bot2, fy2).mul(0.5);

      // Octave 3: fine detail
      const h3 = hash(floor(nx.mul(16.0)).add(floor(ny.mul(16.0)).mul(431.0)).add(99.0));
      const h3b = hash(floor(nx.mul(16.0)).add(1.0).add(floor(ny.mul(16.0)).mul(431.0)).add(99.0));
      const h3c = hash(floor(nx.mul(16.0)).add(floor(ny.mul(16.0).add(1.0)).mul(431.0)).add(99.0));
      const h3d = hash(floor(nx.mul(16.0)).add(1.0).add(floor(ny.mul(16.0).add(1.0)).mul(431.0)).add(99.0));
      const fx3 = fract(nx.mul(16.0));
      const fy3 = fract(ny.mul(16.0));
      const top3 = mix(h3, h3b, fx3);
      const bot3 = mix(h3c, h3d, fx3);
      const oct3 = mix(top3, bot3, fy3).mul(0.25);

      const totalHeight = oct1.add(oct2).add(oct3);

      heightA.element(instanceIndex).assign(totalHeight);
      heightB.element(instanceIndex).assign(totalHeight);
      waterA.element(instanceIndex).assign(float(0.0));
      waterB.element(instanceIndex).assign(float(0.0));
    })().compute(TOTAL);

    // ── Rain: add small amount of water to cells using hash-based randomness ──
    const computeRain = Fn(() => {
      const idx = float(instanceIndex);
      const frame = frameUniform;

      // Use hash of index + frame to determine if this cell gets rain
      const rainChance = hash(idx.add(frame.mul(7.13)));
      // ~5% of cells get rain each step
      const rainAmount = smoothstep(0.95, 1.0, rainChance).mul(0.002);

      const currentWater = waterA.element(instanceIndex);
      waterA.element(instanceIndex).assign(currentWater.add(rainAmount));
    })().compute(TOTAL);

    // ── Erosion + Flow: move water downhill, erode terrain ──
    const computeErosionFlow = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(w);
      const gy = floor(idx.div(w));

      const centerH = heightA.element(instanceIndex);
      const centerW = waterA.element(instanceIndex);
      const centerTotal = centerH.add(centerW);

      // Get neighbor indices (clamped)
      const leftIdx = int(gy.mul(w).add(float(0.0).max(gx.sub(1.0))).min(maxIdx));
      const rightIdx = int(gy.mul(w).add(float(WIDTH - 1.0).min(gx.add(1.0))).min(maxIdx));
      const downIdx = int(float(0.0).max(gy.sub(1.0)).mul(w).add(gx).min(maxIdx));
      const upIdx = int(float(WIDTH - 1.0).min(gy.add(1.0)).mul(w).add(gx).min(maxIdx));

      // Neighbor heights + water
      const leftTotal = heightA.element(leftIdx).add(waterA.element(leftIdx));
      const rightTotal = heightA.element(rightIdx).add(waterA.element(rightIdx));
      const downTotal = heightA.element(downIdx).add(waterA.element(downIdx));
      const upTotal = heightA.element(upIdx).add(waterA.element(upIdx));

      // Height differences (positive = neighbor is lower)
      const dLeft = centerTotal.sub(leftTotal).max(0.0);
      const dRight = centerTotal.sub(rightTotal).max(0.0);
      const dDown = centerTotal.sub(downTotal).max(0.0);
      const dUp = centerTotal.sub(upTotal).max(0.0);

      const totalDiff = dLeft.add(dRight).add(dDown).add(dUp).max(0.0001);

      // Flow rate proportional to water available and height difference
      const flowRate = centerW.min(totalDiff.mul(0.25));

      // Water leaving this cell
      const newWater = centerW.sub(flowRate);

      // Erosion: proportional to flow rate
      const erosionAmount = flowRate.mul(0.01);
      const newHeight = centerH.sub(erosionAmount);

      heightB.element(instanceIndex).assign(newHeight);
      waterB.element(instanceIndex).assign(newWater);

      // Deposit water to neighbors (proportional to height diff)
      // This is an approximation -- each cell adds its outflow to neighbors
      // Some double-counting occurs but it creates visually interesting results
    })().compute(TOTAL);

    // ── Deposit: spread water from neighbors to this cell ──
    const computeDeposit = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(w);
      const gy = floor(idx.div(w));

      // Read from A buffers (pre-erosion state) for neighbor flow contributions
      const centerTotal = heightA.element(instanceIndex).add(waterA.element(instanceIndex));

      const leftIdx = int(gy.mul(w).add(float(0.0).max(gx.sub(1.0))).min(maxIdx));
      const rightIdx = int(gy.mul(w).add(float(WIDTH - 1.0).min(gx.add(1.0))).min(maxIdx));
      const downIdx = int(float(0.0).max(gy.sub(1.0)).mul(w).add(gx).min(maxIdx));
      const upIdx = int(float(WIDTH - 1.0).min(gy.add(1.0)).mul(w).add(gx).min(maxIdx));

      // For each neighbor, compute how much it would send to us
      const calcInflow = (neighborIdx: ReturnType<typeof int>) => {
        const nH = heightA.element(neighborIdx);
        const nW = waterA.element(neighborIdx);
        const nTotal = nH.add(nW);
        const diff = nTotal.sub(centerTotal).max(0.0);

        // Neighbor's total outflow denominator
        const nGx = float(neighborIdx).mod(w);
        const nGy = floor(float(neighborIdx).div(w));
        const nLeftIdx = int(nGy.mul(w).add(float(0.0).max(nGx.sub(1.0))).min(maxIdx));
        const nRightIdx = int(nGy.mul(w).add(float(WIDTH - 1.0).min(nGx.add(1.0))).min(maxIdx));
        const nDownIdx = int(float(0.0).max(nGy.sub(1.0)).mul(w).add(nGx).min(maxIdx));
        const nUpIdx = int(float(WIDTH - 1.0).min(nGy.add(1.0)).mul(w).add(nGx).min(maxIdx));

        const nLeftT = heightA.element(nLeftIdx).add(waterA.element(nLeftIdx));
        const nRightT = heightA.element(nRightIdx).add(waterA.element(nRightIdx));
        const nDownT = heightA.element(nDownIdx).add(waterA.element(nDownIdx));
        const nUpT = heightA.element(nUpIdx).add(waterA.element(nUpIdx));

        const nDiffSum = nTotal.sub(nLeftT).max(0.0)
          .add(nTotal.sub(nRightT).max(0.0))
          .add(nTotal.sub(nDownT).max(0.0))
          .add(nTotal.sub(nUpT).max(0.0))
          .max(0.0001);

        const nFlowRate = nW.min(nDiffSum.mul(0.25));
        const fraction = diff.div(nDiffSum);
        return nFlowRate.mul(fraction);
      };

      const inflow = calcInflow(leftIdx)
        .add(calcInflow(rightIdx))
        .add(calcInflow(downIdx))
        .add(calcInflow(upIdx));

      // Add inflow to the post-erosion water and deposit sediment
      const currentWater = waterB.element(instanceIndex);
      waterB.element(instanceIndex).assign(currentWater.add(inflow));

      // Sediment deposit from neighbor erosion
      const sediment = inflow.mul(0.005);
      const currentHeight = heightB.element(instanceIndex);
      heightB.element(instanceIndex).assign(currentHeight.add(sediment));
    })().compute(TOTAL);

    // ── Evaporation: slowly reduce water ──
    const computeEvaporate = Fn(() => {
      const currentWater = waterB.element(instanceIndex);
      waterB.element(instanceIndex).assign(currentWater.mul(0.995).max(0.0));
    })().compute(TOTAL);

    // ── Copy B -> A ──
    const computeCopy = Fn(() => {
      heightA.element(instanceIndex).assign(heightB.element(instanceIndex));
      waterA.element(instanceIndex).assign(waterB.element(instanceIndex));
    })().compute(TOTAL);

    return {
      heightA, waterA, timeUniform, frameUniform,
      computeInit, computeRain, computeErosionFlow,
      computeDeposit, computeEvaporate, computeCopy,
    };
  }, []);

  // ── Material: read height + water buffers, render to screen ──
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.DoubleSide;

    const renderTerrain = Fn(() => {
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

      const maxI = float(TOTAL - 1);
      const i00 = gy0.mul(w).add(gx0);
      const i10 = gy0.mul(w).add(gx0.add(1.0).min(float(WIDTH - 1)));
      const i01 = gy0.add(1.0).min(float(WIDTH - 1)).mul(w).add(gx0);
      const i11 = gy0.add(1.0).min(float(WIDTH - 1)).mul(w).add(gx0.add(1.0).min(float(WIDTH - 1)));

      // Bilinear height
      const h00 = compute.heightA.element(int(i00.max(0.0).min(maxI)));
      const h10 = compute.heightA.element(int(i10.max(0.0).min(maxI)));
      const h01 = compute.heightA.element(int(i01.max(0.0).min(maxI)));
      const h11 = compute.heightA.element(int(i11.max(0.0).min(maxI)));
      const hTop = mix(h00, h10, fx);
      const hBot = mix(h01, h11, fx);
      const height = mix(hTop, hBot, fy);

      // Bilinear water
      const w00 = compute.waterA.element(int(i00.max(0.0).min(maxI)));
      const w10 = compute.waterA.element(int(i10.max(0.0).min(maxI)));
      const w01 = compute.waterA.element(int(i01.max(0.0).min(maxI)));
      const w11 = compute.waterA.element(int(i11.max(0.0).min(maxI)));
      const wTop = mix(w00, w10, fx);
      const wBot = mix(w01, w11, fx);
      const water = mix(wTop, wBot, fy);

      // Height is roughly 0..1.75 (3 octaves: 1 + 0.5 + 0.25)
      const normalizedH = height.div(1.75).saturate();

      // 5-stop color gradient by height
      // deep green (0.0) -> green (0.25) -> brown (0.5) -> grey (0.75) -> white (1.0)
      const deepGreen = vec3(0.05, 0.2, 0.02);
      const green = vec3(0.15, 0.45, 0.08);
      const brown = vec3(0.45, 0.3, 0.12);
      const grey = vec3(0.55, 0.55, 0.52);
      const white = vec3(0.95, 0.95, 0.98);

      // Chained smoothstep blends
      const t1 = smoothstep(0.0, 0.25, normalizedH);
      const t2 = smoothstep(0.25, 0.5, normalizedH);
      const t3 = smoothstep(0.5, 0.75, normalizedH);
      const t4 = smoothstep(0.75, 1.0, normalizedH);

      const c1 = mix(deepGreen, green, t1);
      const c2 = mix(c1, brown, t2);
      const c3 = mix(c2, grey, t3);
      const terrainColor = mix(c3, white, t4);

      // Simple shading using neighbors for normal estimation
      const hLeft = compute.heightA.element(int(gy0.mul(w).add(gx0.sub(1.0).max(0.0)).min(maxI)));
      const hRight = compute.heightA.element(int(gy0.mul(w).add(gx0.add(1.0).min(float(WIDTH - 1))).min(maxI)));
      const hDown = compute.heightA.element(int(gy0.sub(1.0).max(0.0).mul(w).add(gx0).min(maxI)));
      const hUp = compute.heightA.element(int(gy0.add(1.0).min(float(WIDTH - 1)).mul(w).add(gx0).min(maxI)));

      // Approximate surface normal from height gradient
      const dhdx = hRight.sub(hLeft).mul(4.0);
      const dhdy = hUp.sub(hDown).mul(4.0);
      const normalVec = vec3(dhdx.negate(), float(1.0), dhdy.negate()).normalize();
      // Simple directional light from upper-right
      const lightDir = vec3(0.4, 0.8, 0.3).normalize();
      const diffuse = normalVec.dot(lightDir).max(0.15);

      const litTerrain = terrainColor.mul(diffuse.mul(0.8).add(0.3));

      // Water overlay: blue tint where water > threshold
      const waterBlue = vec3(0.1, 0.3, 0.7);
      const waterIntensity = smoothstep(0.001, 0.015, water);
      const finalColor = mix(litTerrain, waterBlue, waterIntensity.mul(0.7));

      return vec4(finalColor.x, finalColor.y, finalColor.z, float(1.0));
    });

    mat.colorNode = renderTerrain();
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
  const frameCountRef = useRef(0);
  useFrame(() => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer || !renderer.compute) return;

    frameCountRef.current++;
    const fc = frameCountRef.current;
    compute.timeUniform.value += 0.016;
    compute.frameUniform.value = fc;

    // Run 4 simulation steps per frame for visible erosion speed
    for (let step = 0; step < 4; step++) {
      // Update frame for rain randomness variation per sub-step
      compute.frameUniform.value = fc * 4 + step;

      // 1. Rain
      renderer.compute(compute.computeRain);

      // 2. Erosion + Flow
      renderer.compute(compute.computeErosionFlow);

      // 3. Deposit water/sediment from neighbors
      renderer.compute(compute.computeDeposit);

      // 4. Evaporation
      renderer.compute(compute.computeEvaporate);

      // 5. Copy B -> A
      renderer.compute(compute.computeCopy);
    }
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[viewport.width, viewport.height]} />
    </mesh>
  );
}
