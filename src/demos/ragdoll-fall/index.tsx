import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

/**
 * Ragdoll Fall — Articulated stick figure with CPU Verlet integration
 *
 * Techniques:
 * - CPU Verlet integration for 12 joint particles
 * - Distance constraints with iterative relaxation (10 iters)
 * - 5 horizontal bar obstacles with elastic response
 * - Reset + drop from top every cycle
 * - InstancedMesh spheres for joints, cylinders for limbs
 * - Per-body-part color coding (head=white, torso=cyan, limbs=orange)
 * - Tumbling, ragdoll-style motion from gravity + constraints
 */

const GRAVITY = -12.0;
const DAMPING = 0.985;
const CONSTRAINT_ITERS = 12;

interface Particle {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  mass: number;
  pinned: boolean;
}

interface Constraint {
  a: number;
  b: number;
  restLen: number;
}

// Joint indices
const HEAD = 0;
const NECK = 1;
const L_SHOULDER = 2;
const R_SHOULDER = 3;
const L_ELBOW = 4;
const R_ELBOW = 5;
const L_HAND = 6;
const R_HAND = 7;
const HIPS = 8;
const L_KNEE = 9;
const R_KNEE = 10;
const L_FOOT = 11; // actually index 11
const R_FOOT = 12; // actually index 12

// Body part colors
const JOINT_COLORS = [
  '#ffffff', // HEAD
  '#aaddff', // NECK
  '#44ffaa', // L_SHOULDER
  '#44ffaa', // R_SHOULDER
  '#ff8844', // L_ELBOW
  '#ff8844', // R_ELBOW
  '#ffcc44', // L_HAND
  '#ffcc44', // R_HAND
  '#4488ff', // HIPS
  '#ff4488', // L_KNEE
  '#ff4488', // R_KNEE
  '#ff88aa', // L_FOOT
  '#ff88aa', // R_FOOT
];

const JOINT_COUNT = 13;

// Limb connections: [joint1, joint2]
const LIMBS = [
  [HEAD, NECK],
  [NECK, L_SHOULDER],
  [NECK, R_SHOULDER],
  [L_SHOULDER, L_ELBOW],
  [R_SHOULDER, R_ELBOW],
  [L_ELBOW, L_HAND],
  [R_ELBOW, R_HAND],
  [NECK, HIPS],
  [HIPS, L_KNEE],
  [HIPS, R_KNEE],
  [L_KNEE, L_FOOT],
  [R_KNEE, R_FOOT],
];

// Horizontal bar obstacles
const BAR_POSITIONS = [-1.0, -2.5, -4.0, -5.5, -7.0];
const BAR_Y_POSITIONS = BAR_POSITIONS;

function createRagdoll(startY: number): { particles: Particle[]; constraints: Constraint[] } {
  const spread = (Math.random() - 0.5) * 0.5;

  const jointDefs: [number, number, number][] = [
    [spread, startY + 1.8, 0],      // HEAD
    [spread, startY + 1.4, 0],      // NECK
    [spread - 0.4, startY + 1.2, 0], // L_SHOULDER
    [spread + 0.4, startY + 1.2, 0], // R_SHOULDER
    [spread - 0.6, startY + 0.7, 0], // L_ELBOW
    [spread + 0.6, startY + 0.7, 0], // R_ELBOW
    [spread - 0.5, startY + 0.2, 0], // L_HAND
    [spread + 0.5, startY + 0.2, 0], // R_HAND
    [spread, startY + 0.7, 0],       // HIPS
    [spread - 0.25, startY + 0.0, 0], // L_KNEE
    [spread + 0.25, startY + 0.0, 0], // R_KNEE
    [spread - 0.25, startY - 0.7, 0], // L_FOOT
    [spread + 0.25, startY - 0.7, 0], // R_FOOT
  ];

  const particles: Particle[] = jointDefs.map(([x, y, z]) => {
    const pos = new THREE.Vector3(x, y, z);
    return { pos: pos.clone(), prev: pos.clone(), mass: 1.0, pinned: false };
  });

  const constraints: Constraint[] = LIMBS.map(([a, b]) => ({
    a,
    b,
    restLen: particles[a].pos.distanceTo(particles[b].pos),
  }));

  // Add shoulder-to-shoulder and hip stabilizers
  constraints.push(
    { a: L_SHOULDER, b: R_SHOULDER, restLen: particles[L_SHOULDER].pos.distanceTo(particles[R_SHOULDER].pos) },
    { a: NECK, b: L_ELBOW, restLen: particles[NECK].pos.distanceTo(particles[L_ELBOW].pos) * 0.95 },
    { a: NECK, b: R_ELBOW, restLen: particles[NECK].pos.distanceTo(particles[R_ELBOW].pos) * 0.95 },
  );

  return { particles, constraints };
}

export default function RagdollFall() {
  const jointMeshRef = useRef<THREE.InstancedMesh>(null);
  const limbMeshRef = useRef<THREE.InstancedMesh>(null);
  const timeRef = useRef(0);
  const cycleRef = useRef(0);

  const state = useMemo(() => {
    return createRagdoll(8.0);
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tmpDir = useMemo(() => new THREE.Vector3(), []);
  const tmpMid = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const scratchVel = useMemo(() => new THREE.Vector3(), []);
  const scratchDiff = useMemo(() => new THREE.Vector3(), []);

  const jointMaterials = useMemo(() => {
    return JOINT_COLORS.map(c => new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.3,
    }));
  }, []);

  const limbMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#88bbdd',
    roughness: 0.5,
    metalness: 0.2,
  }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.033);
    timeRef.current += dt;

    const { particles, constraints } = state;

    // Check if ragdoll has fallen off-screen
    const headY = particles[HEAD].pos.y;
    if (headY < -9.5) {
      cycleRef.current++;
      const newState = createRagdoll(8.0);
      particles.forEach((p, i) => {
        p.pos.copy(newState.particles[i].pos);
        p.prev.copy(newState.particles[i].prev);
      });
    }

    // Verlet integration
    for (const p of particles) {
      if (p.pinned) continue;
      scratchVel.subVectors(p.pos, p.prev).multiplyScalar(DAMPING);
      p.prev.copy(p.pos);
      p.pos.add(scratchVel);
      p.pos.y += GRAVITY * dt * dt;
    }

    // Constraint relaxation
    for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
      for (const c of constraints) {
        const a = particles[c.a];
        const b = particles[c.b];
        scratchDiff.subVectors(b.pos, a.pos);
        const dist = scratchDiff.length();
        if (dist < 0.0001) continue;
        const correction = scratchDiff.multiplyScalar((dist - c.restLen) / dist * 0.5);
        if (!a.pinned) a.pos.add(correction);
        if (!b.pinned) b.pos.sub(correction);
      }
    }

    // Collision with horizontal bars
    for (const barY of BAR_Y_POSITIONS) {
      for (const p of particles) {
        if (Math.abs(p.pos.y - barY) < 0.12 && Math.abs(p.pos.x) < 2.5) {
          if (p.prev.y > barY) {
            // Falling onto bar
            p.pos.y = barY + 0.12;
            scratchVel.subVectors(p.pos, p.prev);
            p.prev.y = p.pos.y + scratchVel.y * 0.6; // bounce
          }
        }
      }
    }

    // Update joint mesh instances
    const jointMesh = jointMeshRef.current;
    if (jointMesh) {
      for (let i = 0; i < JOINT_COUNT; i++) {
        const p = particles[i];
        dummy.position.copy(p.pos);
        const scale = i === HEAD ? 0.18 : i === HIPS ? 0.13 : 0.09;
        dummy.scale.setScalar(scale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        jointMesh.setMatrixAt(i, dummy.matrix);
      }
      jointMesh.instanceMatrix.needsUpdate = true;
    }

    // Update limb cylinders
    const limbMesh = limbMeshRef.current;
    if (limbMesh) {
      for (let i = 0; i < LIMBS.length; i++) {
        const [ai, bi] = LIMBS[i];
        const a = particles[ai];
        const b = particles[bi];
        tmpMid.addVectors(a.pos, b.pos).multiplyScalar(0.5);
        tmpDir.subVectors(b.pos, a.pos);
        const len = tmpDir.length();
        if (len < 0.001) continue;
        tmpDir.normalize();
        tmpQ.setFromUnitVectors(up, tmpDir);
        dummy.position.copy(tmpMid);
        dummy.quaternion.copy(tmpQ);
        const thick = ai === HEAD || bi === HEAD ? 0.04 : 0.035;
        dummy.scale.set(thick, len * 0.5, thick);
        dummy.updateMatrix();
        limbMesh.setMatrixAt(i, dummy.matrix);
      }
      limbMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <color attach="background" args={['#080408']} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[4, 8, 3]} intensity={0.6} />
      <pointLight position={[0, 0, 3]} intensity={20} color="#ff4488" distance={15} />
      <pointLight position={[-3, -3, 3]} intensity={10} color="#4488ff" distance={10} />

      {/* Joint spheres */}
      <instancedMesh
        ref={jointMeshRef}
        args={[undefined, jointMaterials[0], JOINT_COUNT]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 12]} />
      </instancedMesh>

      {/* Limb cylinders */}
      <instancedMesh
        ref={limbMeshRef}
        args={[undefined, limbMat, LIMBS.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </instancedMesh>

      {/* Horizontal bar obstacles */}
      {BAR_Y_POSITIONS.map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 5.0, 8, 1]} />
          <meshStandardMaterial color="#334455" metalness={0.7} roughness={0.3} emissive="#112233" emissiveIntensity={0.5} />
        </mesh>
      ))}

      {/* Left/right supports */}
      {BAR_Y_POSITIONS.map((y, i) => (
        <group key={`s${i}`}>
          <mesh position={[-2.5, y, 0.5]}>
            <boxGeometry args={[0.08, 0.08, 1.0]} />
            <meshStandardMaterial color="#223344" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[2.5, y, 0.5]}>
            <boxGeometry args={[0.08, 0.08, 1.0]} />
            <meshStandardMaterial color="#223344" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </>
  );
}
