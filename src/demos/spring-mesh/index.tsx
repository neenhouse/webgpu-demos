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
  color,
  mix,
  smoothstep,
} from 'three/tsl';

/**
 * Spring Mesh — GPU compute spring-connected grid with wave ripples
 *
 * Techniques:
 * - 48x48 grid (2304 nodes) in GPU instancedArray (height + velocity)
 * - Hooke's law spring connections to 4 neighbors in compute shader
 * - Damping to dissipate energy
 * - CPU injects random impact spikes to trigger ripples
 * - Displaced PlaneGeometry rendered as InstancedMesh per node
 * - Height-based color: dark blue=neutral, cyan=positive, orange=negative
 * - Multiple simultaneous wave fronts create interference patterns
 */

const GRID_SIZE = 48;
const GRID_TOTAL = GRID_SIZE * GRID_SIZE;
const CELL_SIZE = 0.12;
const SPRING_K = 28.0;
const SPRING_DAMPING = 0.994;

export default function SpringMesh() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const impactTimerRef = useRef(0);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const heights = instancedArray(GRID_TOTAL, 'float');
    const velocities = instancedArray(GRID_TOTAL, 'float');

    const dtUniform = uniform(0.016);
    // We'll use a flat impact array trick: inject via uniform
    const impactIdx = uniform(0);
    const impactStrength = uniform(0.0);

    const computeInit = Fn(() => {
      heights.element(instanceIndex).assign(float(0.0));
      velocities.element(instanceIndex).assign(float(0.0));
    })().compute(GRID_TOTAL);

    const computeUpdate = Fn(() => {
      const idx = instanceIndex;
      const col = idx.modInt(int(GRID_SIZE));
      const row = idx.div(int(GRID_SIZE));
      const dt = dtUniform;

      const h = heights.element(idx);
      const v = velocities.element(idx);

      // Laplacian: sum of neighbor heights
      const sumH = float(0.0).toVar();
      const neighborCount = float(0.0).toVar();

      // Right
      If(col.lessThan(int(GRID_SIZE - 1)), () => {
        sumH.addAssign(heights.element(idx.add(1)));
        neighborCount.addAssign(float(1.0));
      });
      // Left
      If(col.greaterThan(int(0)), () => {
        sumH.addAssign(heights.element(idx.sub(1)));
        neighborCount.addAssign(float(1.0));
      });
      // Down
      If(row.lessThan(int(GRID_SIZE - 1)), () => {
        sumH.addAssign(heights.element(idx.add(GRID_SIZE)));
        neighborCount.addAssign(float(1.0));
      });
      // Up
      If(row.greaterThan(int(0)), () => {
        sumH.addAssign(heights.element(idx.sub(GRID_SIZE)));
        neighborCount.addAssign(float(1.0));
      });

      // Spring force: F = k * (sum_h - n * h)
      const laplacian = sumH.sub(neighborCount.mul(h));
      const springForce = laplacian.mul(float(SPRING_K));

      // New velocity
      const newV = v.add(springForce.mul(dt)).mul(float(SPRING_DAMPING));

      // Impact injection: if this is the impact node, add velocity
      If(idx.equal(impactIdx), () => {
        newV.addAssign(impactStrength);
      });

      velocities.element(idx).assign(newV);
      heights.element(idx).assign(h.add(newV.mul(dt)));
    })().compute(GRID_TOTAL);

    return { heights, velocities, dtUniform, impactIdx, impactStrength, computeInit, computeUpdate };
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const h = compute.heights.element(instanceIndex);
    const hNorm = smoothstep(float(-0.4), float(0.4), h);

    const negColor = color(0xff5500);
    const neutralColor = color(0x001133);
    const posColor = color(0x00ffcc);

    mat.colorNode = mix(negColor, mix(neutralColor, posColor, smoothstep(float(0.4), float(1.0), hNorm)), hNorm);
    mat.emissiveNode = mix(negColor, posColor, hNorm).mul(h.abs().mul(float(4.0)).min(float(2.0)));
    mat.roughness = 0.3;
    mat.metalness = 0.5;

    return mat;
  }, [compute]);

  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);

        // Seed initial disturbances
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            const col = Math.floor(Math.random() * GRID_SIZE);
            const row = Math.floor(Math.random() * GRID_SIZE);
            compute.impactIdx.value = row * GRID_SIZE + col;
            compute.impactStrength.value = (Math.random() > 0.5 ? 1 : -1) * (2.0 + Math.random() * 3.0);
            (gl as unknown as THREE.WebGPURenderer).compute(compute.computeUpdate);
            compute.impactStrength.value = 0;
          }, i * 200);
        }
      });
    }
  }, [gl, compute]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const offset = (GRID_SIZE - 1) * CELL_SIZE * 0.5;
    for (let i = 0; i < GRID_TOTAL; i++) {
      const col = i % GRID_SIZE;
      const row = Math.floor(i / GRID_SIZE);
      dummy.position.set(
        col * CELL_SIZE - offset,
        0,
        row * CELL_SIZE - offset
      );
      dummy.scale.setScalar(CELL_SIZE * 0.42);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer?.compute) return;

    compute.dtUniform.value = Math.min(delta, 0.025);

    impactTimerRef.current += delta;
    // New random impact every ~0.8 seconds
    if (impactTimerRef.current > 0.8) {
      impactTimerRef.current = 0;
      const col = 4 + Math.floor(Math.random() * (GRID_SIZE - 8));
      const row = 4 + Math.floor(Math.random() * (GRID_SIZE - 8));
      compute.impactIdx.value = row * GRID_SIZE + col;
      compute.impactStrength.value = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 2.5);
    } else {
      compute.impactStrength.value = 0;
    }

    renderer.compute(compute.computeUpdate);
    // Extra substep for finer resolution
    compute.impactStrength.value = 0;
    renderer.compute(compute.computeUpdate);
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <color attach="background" args={['#000810']} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[5, 10, 3]} intensity={0.7} />
      <pointLight position={[0, 5, 0]} intensity={20} color="#00ffcc" distance={15} />
      <pointLight position={[3, 3, 3]} intensity={10} color="#ff5500" distance={10} />
      <pointLight position={[-3, 3, -3]} intensity={10} color="#0055ff" distance={10} />

      <group rotation={[-0.4, 0.3, 0]}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, GRID_TOTAL]}
          material={material}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      </group>
    </>
  );
}
