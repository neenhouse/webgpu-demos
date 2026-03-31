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
  hash,
  time,
  color,
  mix,
  smoothstep,
} from 'three/tsl';

/**
 * Cloth in Wind — GPU compute cloth simulation
 *
 * Techniques:
 * - 64x64 particle grid stored in two instancedArray buffers (position + prevPosition)
 * - Verlet integration: newPos = pos + (pos - prevPos) * damping + accel * dt²
 * - Spring constraints to 4 structural neighbors (horizontal + vertical)
 * - Wind force (time-varying) + gravity applied per particle
 * - Top row pinned (particles 0..63 frozen in place)
 * - Color by vertical displacement from rest position
 * - InstancedMesh icosahedrons at each cloth node
 */

const GRID_W = 64;
const GRID_H = 64;
const CLOTH_COUNT = GRID_W * GRID_H;
const REST_DX = 0.075;
const REST_DY = 0.075;

export default function ClothWind() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  const compute = useMemo(() => {
    const positions = instancedArray(CLOTH_COUNT, 'vec3');
    const prevPositions = instancedArray(CLOTH_COUNT, 'vec3');

    const dtUniform = uniform(0.016);
    const windStrength = uniform(0.8);
    const windDir = uniform(new THREE.Vector3(1.0, 0.0, 0.3));

    // Initialize cloth as flat grid in XZ plane
    const computeInit = Fn(() => {
      const idx = instanceIndex;
      const col = idx.modInt(int(GRID_W));
      const row = idx.div(int(GRID_W));

      const x = float(col).sub(float(GRID_W / 2)).mul(REST_DX);
      const y = float(GRID_H - 1).sub(float(row)).mul(REST_DY).add(1.0);
      const z = float(0.0);

      const pos = positions.element(idx);
      const prev = prevPositions.element(idx);
      pos.assign(vec3(x, y, z));
      prev.assign(vec3(x, y, z));
    })().compute(CLOTH_COUNT);

    const computeUpdate = Fn(() => {
      const idx = instanceIndex;
      const col = idx.modInt(int(GRID_W));
      const row = idx.div(int(GRID_W));

      // Pin top row
      If(row.equal(int(0)), () => {
        return;
      });

      const pos = positions.element(idx);
      const prev = prevPositions.element(idx);

      // Verlet: compute velocity from prev
      const vel = pos.sub(prev);

      // Gravity + wind
      const windTime = time.mul(1.5);
      const windX = windDir.x.mul(windStrength).mul(
        float(1.0).add(hash(idx.add(windTime.mul(100.0).toInt())).mul(0.4).sub(0.2))
      );
      const windZ = windDir.z.mul(windStrength).mul(
        float(0.5).add(hash(idx.add(windTime.mul(100.0).toInt()).add(1)).mul(0.3))
      );
      const gravity = vec3(0.0, -4.8, 0.0);
      const wind = vec3(windX, float(0.0), windZ);
      const accel = gravity.add(wind);

      const dt = dtUniform;
      const damping = float(0.995);

      // New position via Verlet
      const newPos = pos.add(vel.mul(damping)).add(accel.mul(dt.mul(dt)));

      // Spring constraints to 4 structural neighbors
      const springStiffness = float(0.35);

      // Right neighbor
      If(col.lessThan(int(GRID_W - 1)), () => {
        const rightPos = positions.element(idx.add(1));
        const diff = rightPos.sub(newPos);
        const dist = diff.length();
        const stretch = dist.sub(REST_DX);
        const correction = diff.normalize().mul(stretch.mul(springStiffness));
        newPos.addAssign(correction);
      });

      // Left neighbor
      If(col.greaterThan(int(0)), () => {
        const leftPos = positions.element(idx.sub(1));
        const diff = leftPos.sub(newPos);
        const dist = diff.length();
        const stretch = dist.sub(REST_DX);
        const correction = diff.normalize().mul(stretch.mul(springStiffness));
        newPos.addAssign(correction);
      });

      // Upper neighbor
      If(row.greaterThan(int(0)), () => {
        const upPos = positions.element(idx.sub(GRID_W));
        const diff = upPos.sub(newPos);
        const dist = diff.length();
        const stretch = dist.sub(REST_DY);
        const correction = diff.normalize().mul(stretch.mul(springStiffness));
        newPos.addAssign(correction);
      });

      // Lower neighbor
      If(row.lessThan(int(GRID_H - 1)), () => {
        const downPos = positions.element(idx.add(GRID_W));
        const diff = downPos.sub(newPos);
        const dist = diff.length();
        const stretch = dist.sub(REST_DY);
        const correction = diff.normalize().mul(stretch.mul(springStiffness));
        newPos.addAssign(correction);
      });

      prev.assign(pos);
      pos.assign(newPos);
    })().compute(CLOTH_COUNT);

    return { positions, prevPositions, dtUniform, windStrength, windDir, computeInit, computeUpdate };
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const pos = compute.positions.element(instanceIndex);
    // Compute rest height for this particle
    const row = instanceIndex.div(int(GRID_W));
    const restY = float(GRID_H - 1).sub(float(row)).mul(REST_DY).add(1.0);
    const displacement = pos.y.sub(restY);
    const dispNorm = smoothstep(float(-0.5), float(0.5), displacement);

    const coolColor = color(0x1144cc);
    const midColor = color(0x44aaff);
    const warmColor = color(0xffeebb);

    const baseColor = mix(coolColor, mix(midColor, warmColor, smoothstep(float(0.4), float(1.0), dispNorm)), dispNorm);
    mat.colorNode = baseColor;
    mat.emissiveNode = baseColor.mul(float(1.5));
    mat.roughness = 0.4;
    mat.metalness = 0.1;

    return mat;
  }, [compute]);

  useEffect(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.computeAsync) {
      renderer.computeAsync(compute.computeInit).then(() => {
        setInitialized(true);
      });
    }
  }, [gl, compute]);

  // Set initial instance matrices
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < CLOTH_COUNT; i++) {
      const col = i % GRID_W;
      const row = Math.floor(i / GRID_W);
      const x = (col - GRID_W / 2) * REST_DX;
      const y = (GRID_H - 1 - row) * REST_DY + 1.0;
      dummy.position.set(x, y, 0);
      dummy.scale.setScalar(0.025);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer?.compute) {
      compute.dtUniform.value = Math.min(delta, 0.033);
      // Run multiple substeps for stability
      renderer.compute(compute.computeUpdate);
      renderer.compute(compute.computeUpdate);
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <color attach="background" args={['#050a15']} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 8, 3]} intensity={0.8} />
      <pointLight position={[-3, 5, 4]} intensity={10} color="#44aaff" distance={15} />
      <pointLight position={[3, 3, -2]} intensity={8} color="#aaddff" distance={12} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, CLOTH_COUNT]}
        material={material}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 0]} />
      </instancedMesh>

      {/* Hanging posts at top corners */}
      <mesh position={[-(GRID_W / 2) * REST_DX, 1.0 + (GRID_H - 1) * REST_DY + 0.3, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
        <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[(GRID_W / 2) * REST_DX, 1.0 + (GRID_H - 1) * REST_DY + 0.3, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
        <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.2} />
      </mesh>
    </>
  );
}
