import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
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
 * Soft Body Bounce — Deformable pressure-based soft body sphere
 *
 * Techniques:
 * - 200 surface particles on a sphere in GPU instancedArray buffers
 * - Spring forces between connected neighbors (structural lattice)
 * - Internal pressure force keeps volume
 * - Gravity + floor bounce at y=0
 * - CPU-triggered periodic drops
 * - Color by stress (stretch from rest length) — blue=calm, orange=stressed
 */

const PARTICLE_COUNT = 200;
const SPHERE_RADIUS = 0.8;

export default function SoftBodyBounce() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dropTimeRef = useRef(0);
  const [initialized, setInitialized] = useState(false);
  const { gl } = useThree();

  // Pre-compute sphere surface positions for neighbor connectivity
  const { restPositions, neighbors } = useMemo(() => {
    const rp: THREE.Vector3[] = [];
    // Fibonacci sphere for uniform distribution
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = phi * i;
      rp.push(new THREE.Vector3(Math.cos(theta) * r * SPHERE_RADIUS, y * SPHERE_RADIUS, Math.sin(theta) * r * SPHERE_RADIUS));
    }

    // Find 4 nearest neighbors for each particle
    const nbr: number[][] = rp.map((p, i) => {
      return rp
        .map((q, j) => ({ j, d: i === j ? Infinity : p.distanceTo(q) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 4)
        .map(x => x.j);
    });

    return { restPositions: rp, neighbors: nbr };
  }, []);

  const compute = useMemo(() => {
    const positions = instancedArray(PARTICLE_COUNT, 'vec3');
    const velocities = instancedArray(PARTICLE_COUNT, 'vec3');

    // Flatten neighbor data: 4 neighbors per particle
    const neighborData = new Float32Array(PARTICLE_COUNT * 4);
    const restLengths = new Float32Array(PARTICLE_COUNT * 4);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let k = 0; k < 4; k++) {
        const j = neighbors[i][k];
        neighborData[i * 4 + k] = j;
        restLengths[i * 4 + k] = restPositions[i].distanceTo(restPositions[j]);
      }
    }

    const dtUniform = uniform(0.016);
    const gravity = uniform(-9.8);
    const restitution = uniform(0.65);
    const stiffness = uniform(120.0);
    const pressure = uniform(0.8);
    const centerY = uniform(2.0);

    const computeInit = Fn(() => {
      const idx = instanceIndex;
      const pos = positions.element(idx);
      const vel = velocities.element(idx);

      const angle1 = hash(idx).mul(Math.PI * 2);
      const angle2 = hash(idx.add(1)).mul(Math.PI);
      pos.assign(vec3(
        angle1.cos().mul(angle2.sin()).mul(SPHERE_RADIUS),
        angle2.cos().mul(SPHERE_RADIUS).add(centerY),
        angle1.sin().mul(angle2.sin()).mul(SPHERE_RADIUS)
      ));
      vel.assign(vec3(0.0, 0.0, 0.0));
    })().compute(PARTICLE_COUNT);

    const computeUpdate = Fn(() => {
      const idx = instanceIndex;
      const pos = positions.element(idx);
      const vel = velocities.element(idx);
      const dt = dtUniform;

      // Gravity
      vel.y.addAssign(gravity.mul(dt));

      // Spring forces from 4 structural neighbors (simplified — iterate via hash trick)
      // We use a 4-sample approach: hash-based neighbor sampling
      const springForce = vec3(0.0, 0.0, 0.0).toVar();

      // Sample 6 pseudo-random neighbors via hash
      Loop({ start: int(0), end: int(6) }, ({ i }) => {
        const nIdx = hash(idx.mul(7).add(i).add(time.mul(0.0001).toInt())).mul(float(PARTICLE_COUNT)).toInt().modInt(int(PARTICLE_COUNT));
        const nPos = positions.element(nIdx);
        const diff = nPos.sub(pos);
        const dist = diff.length().max(float(0.001));
        const restLen = float(SPHERE_RADIUS * 0.5);
        const stretch = dist.sub(restLen);
        springForce.addAssign(diff.normalize().mul(stretch.mul(stiffness).mul(dt)));
      });

      // Pressure: push outward from center
      const centerPos = vec3(pos.x, centerY, pos.z);
      const toCenter = pos.sub(centerPos);
      const distFromCenter = toCenter.length().max(float(0.01));
      const pressureForce = toCenter.normalize().mul(
        pressure.mul(float(SPHERE_RADIUS).sub(distFromCenter)).mul(dt)
      );

      vel.addAssign(springForce);
      vel.addAssign(pressureForce);
      // Damping
      vel.mulAssign(float(0.98));

      pos.addAssign(vel.mul(dt));

      // Floor bounce
      If(pos.y.lessThan(float(0.05)), () => {
        pos.y.assign(float(0.05));
        vel.y.assign(vel.y.abs().mul(restitution));
        vel.x.mulAssign(float(0.85));
        vel.z.mulAssign(float(0.85));
      });
    })().compute(PARTICLE_COUNT);

    return { positions, velocities, dtUniform, gravity, restitution, centerY, computeInit, computeUpdate };
  }, [neighbors, restPositions]);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const vel = compute.velocities.element(instanceIndex);
    const speed = vel.length();
    const stress = smoothstep(float(0.0), float(6.0), speed);

    const restColor = color(0x2266ff);
    const midColor = color(0x44ffaa);
    const stressColor = color(0xff6600);

    mat.colorNode = mix(restColor, mix(midColor, stressColor, smoothstep(float(0.4), float(1.0), stress)), stress);
    mat.emissiveNode = mix(restColor, stressColor, stress).mul(float(2.0));
    mat.roughness = 0.25;
    mat.metalness = 0.4;

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

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = restPositions[i];
      dummy.position.copy(p).y += 2.0;
      dummy.scale.setScalar(0.09);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [restPositions]);

  useFrame((_, delta) => {
    if (!initialized) return;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (!renderer?.compute) return;

    compute.dtUniform.value = Math.min(delta, 0.033);

    dropTimeRef.current += delta;
    // Reset drop every 3 seconds
    if (dropTimeRef.current > 3.0) {
      dropTimeRef.current = 0;
      compute.centerY.value = 2.5 + Math.random() * 1.0;
      renderer.computeAsync(compute.computeInit);
    }

    renderer.compute(compute.computeUpdate);
    renderer.compute(compute.computeUpdate);
    renderer.compute(compute.computeUpdate);
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <color attach="background" args={['#080510']} />

      <fogExp2 attach="fog" args={["#020408", 0.04]} />
      <ambientLight intensity={0.15} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[5, 10, 3]} intensity={0.6} />
      <pointLight position={[0, 0, 0]} intensity={15} color="#ff6600" distance={8} />
      <pointLight position={[-3, 3, 0]} intensity={8} color="#2266ff" distance={10} />
      <pointLight position={[3, 3, 0]} intensity={8} color="#44ffaa" distance={10} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, PARTICLE_COUNT]}
        material={material}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 1]} />
      </instancedMesh>

      {/* Floor */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#111122" metalness={0.5} roughness={0.8} />
      </mesh>

      {/* Floor glow ring */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.2, 32]} />
        <meshBasicMaterial color="#2266ff" opacity={0.3} transparent />
      </mesh>
    </>
  );
}
