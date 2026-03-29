import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

/**
 * Rope Bridge — CPU Verlet integration rope simulation
 *
 * Techniques:
 * - CPU Verlet integration for 3 ropes (main cable + 2 handrails)
 * - 100 particles per rope with distance constraints (relaxation)
 * - Cross-links between ropes simulating planks
 * - Fixed endpoint posts at each end
 * - Periodic sinusoidal wind force
 * - InstancedMesh spheres at each node + cylinder segments as rope links
 * - Time-varying wind with perlin-like noise
 */

const ROPE_PARTICLES = 60;
const ROPE_COUNT = 3;
const TOTAL_PARTICLES = ROPE_PARTICLES * ROPE_COUNT;
const ROPE_LENGTH = 10.0;
const SEGMENT_LENGTH = ROPE_LENGTH / (ROPE_PARTICLES - 1);
const HANDRAIL_OFFSET = 0.4;
const CONSTRAINT_ITERATIONS = 10;
const GRAVITY = -6.0;
const DAMPING = 0.992;

interface Particle {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  pinned: boolean;
}

function createRope(startX: number, endX: number, startY: number, endY: number, z: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < ROPE_PARTICLES; i++) {
    const t = i / (ROPE_PARTICLES - 1);
    const x = startX + (endX - startX) * t;
    const sag = -Math.sin(t * Math.PI) * 1.2;
    const y = startY + (endY - startY) * t + sag;
    const pos = new THREE.Vector3(x, y, z);
    particles.push({
      pos: pos.clone(),
      prev: pos.clone(),
      pinned: i === 0 || i === ROPE_PARTICLES - 1,
    });
  }
  return particles;
}

export default function RopeBridge() {
  const sphereRef = useRef<THREE.InstancedMesh>(null);
  const cylinderRef = useRef<THREE.InstancedMesh>(null);
  const plankRef = useRef<THREE.InstancedMesh>(null);
  const timeRef = useRef(0);
  const windPhaseRef = useRef(0);

  const state = useMemo(() => {
    // Main cable (center, low)
    const mainCable = createRope(-5, 5, 0.5, 0.5, 0);
    // Left handrail
    const leftRail = createRope(-5, 5, 1.3, 1.3, -HANDRAIL_OFFSET);
    // Right handrail
    const rightRail = createRope(-5, 5, 1.3, 1.3, HANDRAIL_OFFSET);

    const ropes = [mainCable, leftRail, rightRail];

    // Segment lengths (rest distances)
    const segLengths = [SEGMENT_LENGTH, SEGMENT_LENGTH, SEGMENT_LENGTH];

    return { ropes, segLengths };
  }, []);

  // Sphere and cylinder meshes counts
  const SEGMENT_COUNT = ROPE_PARTICLES - 1;
  const LINK_COUNT = ROPE_COUNT * SEGMENT_COUNT;
  const PLANK_COUNT = Math.floor(ROPE_PARTICLES / 3);

  const sphereMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8b6914',
    roughness: 0.7,
    metalness: 0.3,
  }), []);

  const cylinderMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#a07830',
    roughness: 0.8,
    metalness: 0.1,
  }), []);

  const plankMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#5a3e1e',
    roughness: 0.9,
    metalness: 0.0,
  }), []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tmpDir = useMemo(() => new THREE.Vector3(), []);
  const tmpMid = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const scratchVel = useMemo(() => new THREE.Vector3(), []);
  const scratchDiff = useMemo(() => new THREE.Vector3(), []);
  const scratchCorr = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);
    timeRef.current += dt;
    const t = timeRef.current;

    // Wind force: sinusoidal with variation
    windPhaseRef.current += dt * 0.7;
    const windX = Math.sin(windPhaseRef.current * 1.3) * 2.5;
    const windY = Math.sin(windPhaseRef.current * 0.8) * 0.3;
    const windZ = Math.sin(windPhaseRef.current * 1.7) * 1.5;

    const { ropes } = state;

    // Update each rope with Verlet
    for (const rope of ropes) {
      for (const p of rope) {
        if (p.pinned) continue;

        scratchVel.subVectors(p.pos, p.prev);
        scratchVel.multiplyScalar(DAMPING);

        // Store prev
        p.prev.copy(p.pos);

        // Integrate: pos += vel + accel * dt²
        p.pos.x += scratchVel.x + windX * dt * dt;
        p.pos.y += scratchVel.y + (GRAVITY + windY) * dt * dt;
        p.pos.z += scratchVel.z + windZ * dt * dt;
      }

      // Constraint relaxation
      for (let iter = 0; iter < CONSTRAINT_ITERATIONS; iter++) {
        for (let i = 0; i < rope.length - 1; i++) {
          const a = rope[i];
          const b = rope[i + 1];
          scratchDiff.subVectors(b.pos, a.pos);
          const dist = scratchDiff.length();
          if (dist < 0.0001) continue;
          const correction = scratchDiff.multiplyScalar((dist - SEGMENT_LENGTH) / dist * 0.5);
          if (!a.pinned) a.pos.add(correction);
          if (!b.pinned) b.pos.sub(correction);
        }
      }
    }

    // Cross-links between main cable and handrails (plank constraints)
    const crossRestLen = Math.sqrt(1.1 * 1.1 + HANDRAIL_OFFSET * HANDRAIL_OFFSET);
    for (let iter = 0; iter < 5; iter++) {
      for (let i = 0; i < ROPE_PARTICLES; i++) {
        // Left handrail to main cable vertical post
        {
          const a = ropes[0][i]; // main cable
          const b = ropes[1][i]; // left rail
          scratchDiff.subVectors(b.pos, a.pos);
          const dist = scratchDiff.length();
          if (dist > 0.0001) {
            scratchCorr.copy(scratchDiff).multiplyScalar((dist - crossRestLen) / dist * 0.3);
            if (!a.pinned) a.pos.addScaledVector(scratchCorr, 0.5);
            if (!b.pinned) b.pos.addScaledVector(scratchCorr, -0.5);
          }
        }
        // Right handrail to main cable
        {
          const a = ropes[0][i]; // main cable
          const b = ropes[2][i]; // right rail
          scratchDiff.subVectors(b.pos, a.pos);
          const dist = scratchDiff.length();
          if (dist > 0.0001) {
            scratchCorr.copy(scratchDiff).multiplyScalar((dist - crossRestLen) / dist * 0.3);
            if (!a.pinned) a.pos.addScaledVector(scratchCorr, 0.5);
            if (!b.pinned) b.pos.addScaledVector(scratchCorr, -0.5);
          }
        }
      }
    }

    // Update sphere instances (rope nodes)
    const sphereMesh = sphereRef.current;
    if (sphereMesh) {
      let idx = 0;
      for (const rope of ropes) {
        for (const p of rope) {
          dummy.position.copy(p.pos);
          dummy.scale.setScalar(rope === ropes[0] ? 0.06 : 0.04);
          dummy.updateMatrix();
          sphereMesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
      sphereMesh.instanceMatrix.needsUpdate = true;
    }

    // Update cylinder instances (rope segments)
    const cylMesh = cylinderRef.current;
    if (cylMesh) {
      let idx = 0;
      for (const rope of ropes) {
        for (let i = 0; i < rope.length - 1; i++) {
          const a = rope[i];
          const b = rope[i + 1];
          tmpMid.addVectors(a.pos, b.pos).multiplyScalar(0.5);
          tmpDir.subVectors(b.pos, a.pos);
          const len = tmpDir.length();
          tmpDir.normalize();
          tmpQ.setFromUnitVectors(up, tmpDir);

          dummy.position.copy(tmpMid);
          dummy.quaternion.copy(tmpQ);
          dummy.scale.set(rope === ropes[0] ? 0.04 : 0.025, len * 0.5, rope === ropes[0] ? 0.04 : 0.025);
          dummy.updateMatrix();
          cylMesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
      cylMesh.instanceMatrix.needsUpdate = true;
    }

    // Update plank instances (cross-planks between handrails)
    const plankMesh = plankRef.current;
    if (plankMesh) {
      let idx = 0;
      for (let i = 0; i < ROPE_PARTICLES; i += 3) {
        const left = ropes[1][i];
        const right = ropes[2][i];
        tmpMid.addVectors(left.pos, right.pos).multiplyScalar(0.5);
        tmpDir.subVectors(right.pos, left.pos);
        const len = tmpDir.length();
        tmpDir.normalize();
        tmpQ.setFromUnitVectors(up.set(0, 1, 0), tmpDir);

        dummy.position.copy(tmpMid);
        dummy.quaternion.copy(tmpQ);
        dummy.scale.set(len * 0.5, 0.03, 0.12);
        dummy.updateMatrix();
        plankMesh.setMatrixAt(idx++, dummy.matrix);
      }
      plankMesh.instanceMatrix.needsUpdate = true;
    }

    void t;
  });

  return (
    <>
      <color attach="background" args={['#0a0d0f']} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[8, 12, 4]} intensity={1.0} castShadow />
      <pointLight position={[0, 4, 0]} intensity={15} color="#88cc22" distance={15} />
      <pointLight position={[-5, 2, 0]} intensity={8} color="#ffcc66" distance={10} />
      <pointLight position={[5, 2, 0]} intensity={8} color="#ffcc66" distance={10} />
      <fog attach="fog" args={['#0a0d0f', 12, 25]} />

      {/* Rope node spheres */}
      <instancedMesh
        ref={sphereRef}
        args={[undefined, sphereMat, TOTAL_PARTICLES]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 6, 6]} />
      </instancedMesh>

      {/* Rope segment cylinders */}
      <instancedMesh
        ref={cylinderRef}
        args={[undefined, cylinderMat, LINK_COUNT]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </instancedMesh>

      {/* Bridge planks */}
      <instancedMesh
        ref={plankRef}
        args={[undefined, plankMat, PLANK_COUNT]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Support posts */}
      {[-5, 5].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.0, 0]}>
            <cylinderGeometry args={[0.08, 0.1, 2.5, 8]} />
            <meshStandardMaterial color="#664400" roughness={0.8} metalness={0.1} />
          </mesh>
          <mesh position={[0, -0.3, 0]}>
            <boxGeometry args={[0.4, 0.4, 0.8]} />
            <meshStandardMaterial color="#443300" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Ground */}
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial color="#1a1a0a" roughness={1.0} />
      </mesh>
    </>
  );
}
