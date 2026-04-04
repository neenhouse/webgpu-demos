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
  min,
} from 'three/tsl';

/**
 * Elastic Waves — 2D wave equation on 128x128 grid
 *
 * Techniques:
 * - 128x128 grid in GPU instancedArray (displacement + velocity buffers)
 * - Compute: wave equation with 4-neighbor Laplacian stencil
 * - Wave speed constant c² drives propagation rate
 * - Boundary absorption damping (absorbing boundary condition)
 * - CPU injects periodic point disturbances (constructive interference)
 * - Render as displaced PlaneGeometry — positionNode Y from buffer
 * - Color: positive=cyan, zero=dark, negative=orange
 * - Multiple simultaneous wave sources create beautiful interference
 */

const GRID_SIZE = 128;
const GRID_TOTAL = GRID_SIZE * GRID_SIZE;
const CELL_SIZE = 0.045;
const WAVE_SPEED_SQ = 0.9; // c^2
const WAVE_DAMPING = 0.998;

export default function ElasticWaves() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const disturbTimerRef = useRef(0);
  const disturbanceSourcesRef = useRef([
    { x: 32, z: 32, timer: 0, period: 1.2 },
    { x: 96, z: 96, timer: 0.4, period: 1.5 },
    { x: 32, z: 96, timer: 0.8, period: 1.8 },
    { x: 96, z: 32, timer: 1.1, period: 1.3 },
  ]);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const displacements = instancedArray(GRID_TOTAL, 'float');
    const velocities = instancedArray(GRID_TOTAL, 'float');

    const dtUniform = uniform(0.016);
    const wavespeedSq = uniform(WAVE_SPEED_SQ);
    const dampingUniform = uniform(WAVE_DAMPING);

    // Impact injection via uniform
    const impactIdx = uniform(0);
    const impactAmt = uniform(0.0);

    const computeInit = Fn(() => {
      displacements.element(instanceIndex).assign(float(0.0));
      velocities.element(instanceIndex).assign(float(0.0));
    })().compute(GRID_TOTAL);

    const computeUpdate = Fn(() => {
      const idx = instanceIndex;
      const col = idx.modInt(int(GRID_SIZE));
      const row = idx.div(int(GRID_SIZE));
      const dt = dtUniform;

      const u = displacements.element(idx);
      const v = velocities.element(idx);

      // Boundary absorption: damp near edges
      const colF = col.toFloat();
      const rowF = row.toFloat();
      const maxColF = float(GRID_SIZE - 1);
      const edgeDist = min(min(min(colF, maxColF.sub(colF)), rowF), maxColF.sub(rowF));
      const edgeFade = min(edgeDist.div(float(8.0)), float(1.0));

      // Laplacian (5-point stencil)
      const laplacian = float(0.0).toVar();
      const centerTerm = float(0.0).toVar();
      centerTerm.assign(u.mul(float(-4.0)));

      If(col.greaterThan(int(0)), () => {
        laplacian.addAssign(displacements.element(idx.sub(1)));
      });
      If(col.lessThan(int(GRID_SIZE - 1)), () => {
        laplacian.addAssign(displacements.element(idx.add(1)));
      });
      If(row.greaterThan(int(0)), () => {
        laplacian.addAssign(displacements.element(idx.sub(GRID_SIZE)));
      });
      If(row.lessThan(int(GRID_SIZE - 1)), () => {
        laplacian.addAssign(displacements.element(idx.add(GRID_SIZE)));
      });
      laplacian.addAssign(centerTerm);

      // Wave equation: v_new = v + c^2 * laplacian * dt
      const newV = v.add(wavespeedSq.mul(laplacian).mul(dt));

      // Apply damping + edge absorption
      const dampedV = newV.mul(dampingUniform).mul(edgeFade);

      // Impact injection
      If(idx.equal(impactIdx), () => {
        dampedV.addAssign(impactAmt);
      });

      velocities.element(idx).assign(dampedV);
      displacements.element(idx).assign(u.add(dampedV.mul(dt)));
    })().compute(GRID_TOTAL);

    return { displacements, velocities, dtUniform, impactIdx, impactAmt, computeInit, computeUpdate };
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const d = compute.displacements.element(instanceIndex);
    const dNorm = smoothstep(float(-0.3), float(0.3), d);

    const negColor = color(0xff6600);
    const neutralColor = color(0x001020);
    const posColor = color(0x00ffee);

    mat.colorNode = mix(negColor, mix(neutralColor, posColor, smoothstep(float(0.4), float(1.0), dNorm)), dNorm);
    mat.emissiveNode = mix(negColor, posColor, dNorm).mul(d.abs().mul(float(8.0)).min(float(3.0)));
    mat.roughness = 0.2;
    mat.metalness = 0.4;

    return mat;
  }, [compute]);

  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
        // Initial disturbance at center
        compute.impactIdx.value = 64 * GRID_SIZE + 64;
        compute.impactAmt.value = 3.0;
        (gl as unknown as THREE.WebGPURenderer).compute(compute.computeUpdate);
        compute.impactAmt.value = 0;
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
      dummy.position.set(col * CELL_SIZE - offset, 0, row * CELL_SIZE - offset);
      dummy.scale.setScalar(CELL_SIZE * 0.46);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer?.compute) return;

    compute.dtUniform.value = Math.min(delta, 0.02);
    disturbTimerRef.current += delta;

    // Multiple periodic disturbance sources
    let didInject = false;
    const sources = disturbanceSourcesRef.current;
    for (const src of sources) {
      src.timer += delta;
      if (src.timer >= src.period) {
        src.timer = 0;
        if (!didInject) {
          compute.impactIdx.value = src.z * GRID_SIZE + src.x;
          compute.impactAmt.value = (Math.random() > 0.5 ? 1 : -1) * (2.0 + Math.random() * 2.0);
          didInject = true;
        }
      }
    }
    if (!didInject) {
      compute.impactAmt.value = 0;
    }

    renderer.compute(compute.computeUpdate);

    // Clear impact after one frame
    compute.impactAmt.value = 0;
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <color attach="background" args={['#000812']} />

      <fogExp2 attach="fog" args={["#020804", 0.03]} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[3, 8, 3]} intensity={0.5} />
      <pointLight position={[0, 5, 0]} intensity={25} color="#00ffee" distance={15} />
      <pointLight position={[3, 3, 3]} intensity={12} color="#ff6600" distance={10} />
      <pointLight position={[-3, 3, -3]} intensity={12} color="#0044ff" distance={10} />

      <group rotation={[-0.35, 0.4, 0]}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, GRID_TOTAL]}
          material={material}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      </group>

      {/* Source indicators */}
      {disturbanceSourcesRef.current.map((src, i) => {
        const offset = (GRID_SIZE - 1) * CELL_SIZE * 0.5;
        const x = src.x * CELL_SIZE - offset;
        const z = src.z * CELL_SIZE - offset;
        return (
          <mesh key={i} position={[x, 0.3, z]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial color={i % 2 === 0 ? '#00ffee' : '#ff6600'} />
          </mesh>
        );
      })}
    </>
  );
}
