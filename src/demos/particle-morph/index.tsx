/* eslint-disable react-hooks/immutability */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  uniform,
  float,
  hash,
  time,
  color,
  mix,
  smoothstep,
  positionLocal,
  normalLocal,
  oscSine,
  positionWorld,
  instanceIndex,
} from 'three/tsl';

/**
 * Particle Morph — 5000 particles morphing between 3D shapes
 *
 * Demonstrates:
 * - CPU-driven spring physics morph between 4 recognizable 3D shapes
 * - Noise scatter/swirl during mid-transition
 * - Per-shape color transitions via TSL uniform phase
 * - Shape cycling: sphere -> cube -> torus -> icosahedron -> sphere
 * - hash(positionWorld) for per-instance variation
 * - Hybrid CPU-matrices + GPU-color pattern
 * - requiresWebGPU: true (TSL node materials)
 */

const PARTICLE_COUNT = 5000;
const SHAPE_DURATION = 5.0;
const SHAPE_COUNT = 4;

// --- Shape generators ---

function spherePoint(i: number, count: number): [number, number, number] {
  // Fibonacci sphere for uniform distribution
  const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  const r = 1.6;
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
  ];
}

function cubePoint(i: number, count: number): [number, number, number] {
  const face = Math.floor((i / count) * 6);
  const perFace = count / 6;
  const idx = i % Math.ceil(perFace);
  const side = Math.ceil(Math.sqrt(perFace));
  const u = (idx % side) / side - 0.5;
  const v = Math.floor(idx / side) / side - 0.5;
  const s = 1.3;
  switch (face) {
    case 0: return [s, u * s * 2, v * s * 2];
    case 1: return [-s, u * s * 2, v * s * 2];
    case 2: return [u * s * 2, s, v * s * 2];
    case 3: return [u * s * 2, -s, v * s * 2];
    case 4: return [u * s * 2, v * s * 2, s];
    default: return [u * s * 2, v * s * 2, -s];
  }
}

function torusPoint(i: number, count: number): [number, number, number] {
  const R = 1.2;
  const r = 0.45;
  const golden = (1 + Math.sqrt(5)) / 2;
  const theta = (2 * Math.PI * i) / golden;
  const phi = ((2 * Math.PI * i) / count) * Math.floor(Math.sqrt(count));
  return [
    (R + r * Math.cos(phi)) * Math.cos(theta),
    (R + r * Math.cos(phi)) * Math.sin(theta),
    r * Math.sin(phi),
  ];
}

function icosahedronPoints(count: number): Float32Array {
  const geo = new THREE.IcosahedronGeometry(1.5, 6);
  const posAttr = geo.getAttribute('position');
  const vertCount = posAttr.count;
  const triCount = vertCount / 3;
  const out = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const seed1 = Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
    const seed2 = Math.abs(Math.sin(i * 269.5 + 183.3) * 43758.5453) % 1;
    const seed3 = Math.abs(Math.sin(i * 419.2 + 371.9) * 43758.5453) % 1;

    const triIdx = Math.floor(seed1 * triCount) * 3;
    const b1 = seed2;
    const b2 = seed3 * (1 - b1);
    const b3 = 1 - b1 - b2;

    const i0 = Math.min(triIdx, vertCount - 1);
    const i1 = Math.min(triIdx + 1, vertCount - 1);
    const i2 = Math.min(triIdx + 2, vertCount - 1);

    out[i * 3] = posAttr.getX(i0) * b1 + posAttr.getX(i1) * b2 + posAttr.getX(i2) * b3;
    out[i * 3 + 1] = posAttr.getY(i0) * b1 + posAttr.getY(i1) * b2 + posAttr.getY(i2) * b3;
    out[i * 3 + 2] = posAttr.getZ(i0) * b1 + posAttr.getZ(i1) * b2 + posAttr.getZ(i2) * b3;
  }
  geo.dispose();
  return out;
}

export default function ParticleMorph() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Pre-compute all 4 shape target positions
  const shapeData = useMemo(() => {
    const shapes: Float32Array[] = [];

    const s0 = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const [x, y, z] = spherePoint(i, PARTICLE_COUNT);
      s0[i * 3] = x; s0[i * 3 + 1] = y; s0[i * 3 + 2] = z;
    }
    shapes.push(s0);

    const s1 = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const [x, y, z] = cubePoint(i, PARTICLE_COUNT);
      s1[i * 3] = x; s1[i * 3 + 1] = y; s1[i * 3 + 2] = z;
    }
    shapes.push(s1);

    const s2 = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const [x, y, z] = torusPoint(i, PARTICLE_COUNT);
      s2[i * 3] = x; s2[i * 3 + 1] = y; s2[i * 3 + 2] = z;
    }
    shapes.push(s2);

    shapes.push(icosahedronPoints(PARTICLE_COUNT));
    return shapes;
  }, []);

  // CPU particle state (useRef to allow mutation in useFrame)
  const particleState = useRef({
    pos: new Float32Array(PARTICLE_COUNT * 3),
    vel: new Float32Array(PARTICLE_COUNT * 3),
    scales: new Float32Array(PARTICLE_COUNT),
  });

  // Initialize
  useEffect(() => {
    const src = shapeData[0];
    particleState.current.pos.set(src);
    particleState.current.vel.fill(0);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particleState.current.scales[i] = 0.025 + (Math.abs(Math.sin(i * 127.1) * 43758.5453) % 1) * 0.015;
    }
  }, [shapeData]);

  // TSL uniform for shape phase (drives color)
   
  const shapePhaseUniform = useMemo(() => uniform(0), []);

  // Material: TSL color transitions per shape phase
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const phase = shapePhaseUniform;

    // 4 distinct shape colors
    const sphereCol = color(0x00ccff); // cyan
    const cubeCol = color(0xff6644); // warm orange
    const torusCol = color(0xaa44ff); // purple
    const icoCol = color(0x44ff88); // green

    // Smooth color blend based on phase
    const t01 = smoothstep(0.5, 1.5, phase);
    const t12 = smoothstep(1.5, 2.5, phase);
    const t23 = smoothstep(2.5, 3.5, phase);

    const baseColor = mix(mix(mix(sphereCol, cubeCol, t01), torusCol, t12), icoCol, t23);

    // Per-instance variation via hash(positionWorld) for slight color shift
    const instanceVar = hash(positionWorld.x.mul(73.1).add(positionWorld.z.mul(119.3)));
    const variedColor = mix(baseColor, color(0xffffff), instanceVar.mul(0.15));
    mat.colorNode = variedColor;

    // Emissive: per-instance pulsing with base shape color
    const particlePhase = hash(instanceIndex).mul(6.28);
    mat.emissiveNode = baseColor.mul(
      float(1.5).add(
        oscSine(time.mul(1.5).add(particlePhase)).mul(0.4),
      ),
    );

    // Subtle vertex breathing
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(2.0).add(positionLocal.y.mul(3.0))).mul(0.008)),
    );

    mat.roughness = 0.3;
    mat.metalness = 0.15;

    return mat;
  }, [shapePhaseUniform]);

  // Set initial instance matrices
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    const src = shapeData[0];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      dummy.position.set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
      dummy.scale.setScalar(particleState.current.scales[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [shapeData]);

  const elapsedRef = useRef(0);
  const dummyRef = useRef(new THREE.Object3D());

  // Per-frame: spring physics morph + update instance matrices
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;

    // Shape phase cycling
    const cycleDuration = SHAPE_DURATION * SHAPE_COUNT;
    const cycleT = (t % cycleDuration) / SHAPE_DURATION;
    const shapeIdx = Math.floor(cycleT) % SHAPE_COUNT;
    const morphT = cycleT - Math.floor(cycleT);

    // Hold 60%, morph 40%
    const holdFraction = 0.6;
    let progress: number;
    let nextShapeIdx: number;
    if (morphT < holdFraction) {
      progress = 0;
      nextShapeIdx = shapeIdx;
    } else {
      progress = (morphT - holdFraction) / (1 - holdFraction);
      nextShapeIdx = (shapeIdx + 1) % SHAPE_COUNT;
    }

    const currentShape = shapeData[shapeIdx];
    const nextShape = shapeData[nextShapeIdx];


    // Compute blended targets with smoothstep easing
    const sp = progress * progress * (3 - 2 * progress);
    const invSp = 1 - sp;

    const { pos, vel, scales } = particleState.current;

    // Spring physics constants
    const springK = 8.0;
    const damping = 3.5;
    const scatterStrength = progress * (1 - progress) * 4.0;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Blended target
      const tx = currentShape[i3] * invSp + nextShape[i3] * sp;
      const ty = currentShape[i3 + 1] * invSp + nextShape[i3 + 1] * sp;
      const tz = currentShape[i3 + 2] * invSp + nextShape[i3 + 2] * sp;

      // Spring force
      const dx = tx - pos[i3];
      const dy = ty - pos[i3 + 1];
      const dz = tz - pos[i3 + 2];

      // Per-particle deterministic noise scatter
      const seed = Math.abs(Math.sin(i * 127.1) * 43758.5453) % 1;
      const noiseScale = scatterStrength * (seed + 0.5) * 1.2;
      const nx = Math.sin(seed * 6.28 + t * 2.5 + i * 0.01) * noiseScale;
      const ny = Math.sin(seed * 4.17 + t * 3.1 + i * 0.013) * noiseScale;
      const nz = Math.sin(seed * 5.43 + t * 2.8 + i * 0.017) * noiseScale;

      // Velocity integration: spring + noise - damping
      vel[i3] += (dx * springK + nx - vel[i3] * damping) * dt;
      vel[i3 + 1] += (dy * springK + ny - vel[i3 + 1] * damping) * dt;
      vel[i3 + 2] += (dz * springK + nz - vel[i3 + 2] * damping) * dt;

      // Position integration
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
    }

    // Update instance matrices
    const mesh = meshRef.current;
    if (mesh) {
      const dummy = dummyRef.current;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        dummy.position.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
        dummy.scale.setScalar(scales[i]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Update color phase uniform for TSL material
    const phaseValue = shapeIdx + (progress > 0 ? progress : 0);
    shapePhaseUniform.value = phaseValue;

    // Gentle group rotation
    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.15;
    }
  });

  return (
    <>
      <ambientLight intensity={0.1} />
      <directionalLight position={[3, 4, 5]} intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={3.0} color="#00ccff" distance={10} />
      <pointLight position={[2, 2, 2]} intensity={2.0} color="#ff6644" distance={8} />
      <pointLight position={[-2, -1, -2]} intensity={2.0} color="#aa44ff" distance={8} />
      <pointLight position={[0, 2, -2]} intensity={1.5} color="#44ff88" distance={8} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 1]} />
        </instancedMesh>
      </group>
    </>
  );
}
