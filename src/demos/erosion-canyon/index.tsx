import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
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
 * Erosion Canyon — Hydraulic erosion carving a canyon via compute
 *
 * 128x128 height grid in instancedArray.
 * Compute: hydraulic erosion with pre-carved river channel.
 * Water level decreasing to reveal layers.
 * 4-layer rock strata colors (red, brown, tan, white) by original height.
 * River: blue translucent plane at water level.
 * Instanced green cone vegetation on rim.
 *
 * Techniques: GPU compute erosion, strata coloring, animated water level.
 */

const WIDTH = 128;
const TOTAL = WIDTH * WIDTH;
const VEG_COUNT = 80;

export default function ErosionCanyon() {
  const { viewport, gl } = useThree();
  const [initialized, setInitialized] = useState(false);
  const waterRef = useRef<THREE.Mesh>(null);
  const vegRef = useRef<THREE.InstancedMesh>(null);
  const totalTimeRef = useRef(0);

  const compute = useMemo(() => {
    const heightA = instancedArray(TOTAL, 'float');
    const heightB = instancedArray(TOTAL, 'float');
    const waterA = instancedArray(TOTAL, 'float');
    const waterB = instancedArray(TOTAL, 'float');
    const sedimentA = instancedArray(TOTAL, 'float');
    const sedimentB = instancedArray(TOTAL, 'float');

    const tUniform = uniform(0.0);
    const frameUniform = uniform(0.0);
    const w = float(WIDTH);
    const maxIdx = float(TOTAL - 1);

    // Init: canyon terrain with river bed
    const computeInit = Fn(() => {
      const idx = float(instanceIndex);
      const gx = idx.mod(w);
      const gy = floor(idx.div(w));
      const nx = gx.div(w);
      const ny = gy.div(w);

      // Multi-octave noise terrain
      const h1 = hash(floor(nx.mul(6.0)).add(floor(ny.mul(6.0)).mul(137.0)));
      const h1b = hash(floor(nx.mul(6.0)).add(1.0).add(floor(ny.mul(6.0)).mul(137.0)));
      const h1c = hash(floor(nx.mul(6.0)).add(floor(ny.mul(6.0).add(1.0)).mul(137.0)));
      const h1d = hash(floor(nx.mul(6.0)).add(1.0).add(floor(ny.mul(6.0).add(1.0)).mul(137.0)));
      const fx1 = fract(nx.mul(6.0));
      const fy1 = fract(ny.mul(6.0));
      const oct1 = mix(mix(h1, h1b, fx1), mix(h1c, h1d, fx1), fy1).mul(0.7);

      const h2 = hash(floor(nx.mul(12.0)).add(floor(ny.mul(12.0)).mul(271.0)).add(50.0));
      const h2b = hash(floor(nx.mul(12.0)).add(1.0).add(floor(ny.mul(12.0)).mul(271.0)).add(50.0));
      const h2c = hash(floor(nx.mul(12.0)).add(floor(ny.mul(12.0).add(1.0)).mul(271.0)).add(50.0));
      const h2d = hash(floor(nx.mul(12.0)).add(1.0).add(floor(ny.mul(12.0).add(1.0)).mul(271.0)).add(50.0));
      const fx2 = fract(nx.mul(12.0));
      const fy2 = fract(ny.mul(12.0));
      const oct2 = mix(mix(h2, h2b, fx2), mix(h2c, h2d, fx2), fy2).mul(0.3);

      const baseH = oct1.add(oct2);

      // Pre-carve river channel down center (x=0.5 line)
      const distToCenter = nx.sub(0.5).abs();
      const riverWidth = float(0.08);
      const riverDepth = smoothstep(riverWidth, float(0.0), distToCenter).mul(0.5);
      const finalH = baseH.sub(riverDepth).max(float(0.0));

      heightA.element(instanceIndex).assign(finalH);
      heightB.element(instanceIndex).assign(finalH);
      waterA.element(instanceIndex).assign(float(0.0));
      waterB.element(instanceIndex).assign(float(0.0));
      sedimentA.element(instanceIndex).assign(float(0.0));
      sedimentB.element(instanceIndex).assign(float(0.0));
    })().compute(TOTAL);

    // Rain + flow compute pass
    const computeErosion = Fn(() => {
      const idx = float(instanceIndex);
      const gx = floor(idx.mod(w));
      const gy = floor(idx.div(w));

      const h = heightA.element(instanceIndex);
      const water = waterA.element(instanceIndex);
      const sed = sedimentA.element(instanceIndex);

      // Rain: add water on river channel area
      const nx = gx.div(w);
      const distToCenter = nx.sub(0.5).abs();
      const isRiverZone = smoothstep(float(0.15), float(0.0), distToCenter);
      waterB.element(instanceIndex).assign(water.add(isRiverZone.mul(0.003)));

      // Flow outward: check neighbors
      const outflow = float(0.0).toVar();

      const leftIdx = int(instanceIndex).sub(1).max(0);
      const rightIdx = int(instanceIndex).add(1).min(TOTAL - 1);
      const upIdx = int(instanceIndex).sub(WIDTH).max(0);
      const downIdx = int(instanceIndex).add(WIDTH).min(TOTAL - 1);

      const hL = heightA.element(leftIdx);
      const hR = heightA.element(rightIdx);
      const hU = heightA.element(upIdx);
      const hD = heightA.element(downIdx);

      const totalH = h.add(water);
      const totalHL = hL.add(waterA.element(leftIdx));
      const totalHR = hR.add(waterA.element(rightIdx));
      const totalHU = hU.add(waterA.element(upIdx));
      const totalHD = hD.add(waterA.element(downIdx));

      const flowL = totalH.sub(totalHL).max(float(0.0)).mul(0.25);
      const flowR = totalH.sub(totalHR).max(float(0.0)).mul(0.25);
      const flowU = totalH.sub(totalHU).max(float(0.0)).mul(0.25);
      const flowD = totalH.sub(totalHD).max(float(0.0)).mul(0.25);

      outflow.assign(flowL.add(flowR).add(flowU).add(flowD).min(water));

      // Erosion: water flow erodes terrain
      const erosionRate = outflow.mul(0.002);
      const newH = h.sub(erosionRate).max(float(0.0));
      heightB.element(instanceIndex).assign(newH);

      const newWater = water.sub(outflow).add(erosionRate).max(float(0.0));
      waterB.element(instanceIndex).assign(waterB.element(instanceIndex).add(newWater).mul(0.5));

      sedimentB.element(instanceIndex).assign(sed.add(erosionRate).mul(0.99));
    })().compute(TOTAL);

    // Copy B->A
    const computeCopy = Fn(() => {
      heightA.element(instanceIndex).assign(heightB.element(instanceIndex));
      waterA.element(instanceIndex).assign(waterB.element(instanceIndex));
      sedimentA.element(instanceIndex).assign(sedimentB.element(instanceIndex));
    })().compute(TOTAL);

    // Render to viewport plane
    const waterLevelUniform = uniform(0.4);
    const timU = tUniform;

    const renderMat = new THREE.MeshStandardNodeMaterial();
    const u = screenUV.x;
    const v = screenUV.y;
    const renderIdx = int(floor(v.mul(w)).mul(w).add(floor(u.mul(w))).clamp(float(0), float(TOTAL - 1)));

    const renderH = heightA.element(renderIdx);
    const renderWater = waterA.element(renderIdx);

    // Strata coloring
    const redRock = vec3(0.65, 0.20, 0.08);
    const brownRock = vec3(0.45, 0.28, 0.12);
    const tanRock = vec3(0.72, 0.58, 0.38);
    const whiteRock = vec3(0.88, 0.84, 0.78);

    const h01 = smoothstep(float(0.0), float(0.25), renderH);
    const h12 = smoothstep(float(0.25), float(0.5), renderH);
    const h23 = smoothstep(float(0.5), float(0.75), renderH);
    const strataColor = mix(
      mix(vec3(0.15, 0.1, 0.05), mix(redRock, brownRock, h01), h01),
      mix(tanRock, whiteRock, h23),
      h12,
    );

    // Water overlay
    const waterColor = vec3(0.1, 0.4, 0.8);
    const waterPresence = smoothstep(float(0.01), float(0.05), renderWater);
    const finalColor = mix(strataColor, waterColor, waterPresence.mul(0.7));

    renderMat.colorNode = vec4(finalColor, float(1.0));
    renderMat.roughness = 0.8;

    return {
      heightA, waterA, sedimentA,
      computeInit, computeErosion, computeCopy,
      renderMat, waterLevelUniform, tUniform: timU,
    };
  }, []);

  // Init
  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => setInitialized(true));
    }
  }, [gl, compute]);

  // Build vegetation on rim
  useEffect(() => {
    const mesh = vegRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < VEG_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = (i / VEG_COUNT) * 6 - 3;
      dummy.position.set(
        side * (2.5 + Math.random() * 1.0),
        -0.5 + Math.random() * 0.3,
        z,
      );
      dummy.scale.set(0.06 + Math.random() * 0.04, 0.2 + Math.random() * 0.2, 0.06 + Math.random() * 0.04);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    totalTimeRef.current += delta;
    const renderer = gl as unknown as THREE.WebGPURenderer;

    if (initialized && renderer?.compute) {
      compute.tUniform.value = totalTimeRef.current;
      renderer.compute(compute.computeErosion);
      renderer.compute(compute.computeCopy);
    }

    // Animate water level
    if (waterRef.current) {
      const level = 0.3 + Math.sin(totalTimeRef.current * 0.2) * 0.15;
      waterRef.current.position.y = level * 2 - 1.5;
    }
  });

  return (
    <>
      <color attach="background" args={['#cc8844']} />
      <fog attach="fog" args={['#aa6622', 8, 20]} />
      <ambientLight intensity={0.7} color="#ffcc88" />
      <directionalLight position={[4, 8, 2]} intensity={2.0} color="#fff8e7" />
      <directionalLight position={[-3, 5, -2]} intensity={0.4} color="#ffaa44" />
      <pointLight position={[0, -0.5, 0]} intensity={3.0} color="#4466ff" distance={8} />

      {/* Full-viewport erosion map */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[6, 6, 1]}>
        <planeGeometry args={[1, 1, 1, 1]} />
        <primitive object={compute.renderMat} />
      </mesh>

      {/* Canyon walls (decorative box sides) */}
      {[-3, 3].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]}>
          <boxGeometry args={[0.5, 3, 6]} />
          <meshStandardMaterial color={i === 0 ? '#cc5533' : '#aa4422'} roughness={0.9} />
        </mesh>
      ))}

      {/* River */}
      <mesh
        ref={waterRef}
        position={[0, -0.8, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.8, 6, 4, 4]} />
        <meshStandardMaterial
          color="#2255cc"
          transparent
          opacity={0.5}
          roughness={0.05}
          metalness={0.3}
        />
      </mesh>

      {/* Rim vegetation */}
      <instancedMesh
        ref={vegRef}
        args={[undefined, undefined, VEG_COUNT]}
        frustumCulled={false}
      >
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial color="#2d6a18" roughness={0.8} />
      </instancedMesh>
    </>
  );
}
