import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

/**
 * Pendulum Chaos — Triple pendulum with chaotic trajectories
 *
 * Techniques:
 * - CPU RK4 integrator for 3-joint pendulum physics
 * - 3 pendulums with slightly different initial angles demonstrating chaos
 * - Ring buffer of last 500 positions per bob for trail rendering
 * - InstancedMesh trail spheres with age-based opacity fade
 * - Rod rendering as thin cylinder segments
 * - Bob spheres with emissive color per pendulum
 * - Colors: red/crimson, cyan/electric, gold/amber
 * - Fascinating divergence shows sensitive dependence on initial conditions
 */

const G = 9.81;
const TRAIL_LENGTH = 500;
const PENDULUM_COUNT = 3;
const TOTAL_TRAIL = TRAIL_LENGTH * PENDULUM_COUNT;

interface PendulumState {
  theta1: number;
  theta2: number;
  theta3: number;
  omega1: number;
  omega2: number;
  omega3: number;
  l1: number;
  l2: number;
  l3: number;
  m1: number;
  m2: number;
  m3: number;
}

// Computes derivatives for triple pendulum (returns [dtheta1, dtheta2, dtheta3, domega1, domega2, domega3])
function tripleDerivatives(s: PendulumState): number[] {
  const { theta1, theta2, theta3, omega1, omega2, omega3, l1, l2, l3, m1, m2, m3 } = s;

  const d1 = theta1 - theta2;
  const d2 = theta2 - theta3;
  const d3 = theta1 - theta3;

  const M = m1 + m2 + m3;

  // Simplified Lagrangian equations for triple pendulum
  // (Using approximated equations for visual fidelity)
  const cos12 = Math.cos(d1);
  const sin12 = Math.sin(d1);
  const sin23 = Math.sin(d2);
  const sin13 = Math.sin(d3);

  // Torques (simplified, not exact)
  const tau1 = -G * M * Math.sin(theta1) / l1
    - (m2 + m3) * l2 * omega2 * omega2 * sin12 / l1
    - m3 * l3 * omega3 * omega3 * sin13 / l1
    - (m2 + m3) * l2 * cos12 * 0.1; // cross-coupling damping

  const tau2 = -G * (m2 + m3) * Math.sin(theta2) / l2
    + (m1 + m2 + m3) * l1 * omega1 * omega1 * sin12 / l2
    - m3 * l3 * omega3 * omega3 * sin23 / l2;

  const tau3 = -G * m3 * Math.sin(theta3) / l3
    + (m1 + m2 + m3) * l1 * omega1 * omega1 * sin13 / l3
    + (m2 + m3) * l2 * omega2 * omega2 * sin23 / l3;

  return [omega1, omega2, omega3, tau1, tau2, tau3];
}

function rk4Step(s: PendulumState, dt: number): PendulumState {
  const stateToArray = (s: PendulumState) => [s.theta1, s.theta2, s.theta3, s.omega1, s.omega2, s.omega3];
  const arrayToState = (arr: number[], base: PendulumState): PendulumState => ({
    ...base,
    theta1: arr[0], theta2: arr[1], theta3: arr[2],
    omega1: arr[3], omega2: arr[4], omega3: arr[5],
  });

  const k1 = tripleDerivatives(s);

  const s2 = arrayToState(stateToArray(s).map((v, i) => v + k1[i] * dt / 2), s);
  const k2 = tripleDerivatives(s2);

  const s3 = arrayToState(stateToArray(s).map((v, i) => v + k2[i] * dt / 2), s);
  const k3 = tripleDerivatives(s3);

  const s4 = arrayToState(stateToArray(s).map((v, i) => v + k3[i] * dt), s);
  const k4 = tripleDerivatives(s4);

  const result = stateToArray(s).map((v, i) =>
    v + (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * dt / 6
  );

  return arrayToState(result, s);
}

function pendulumPositions(s: PendulumState, origin: THREE.Vector3): THREE.Vector3[] {
  const p1 = new THREE.Vector3(
    origin.x + s.l1 * Math.sin(s.theta1),
    origin.y - s.l1 * Math.cos(s.theta1),
    origin.z
  );
  const p2 = new THREE.Vector3(
    p1.x + s.l2 * Math.sin(s.theta2),
    p1.y - s.l2 * Math.cos(s.theta2),
    origin.z
  );
  const p3 = new THREE.Vector3(
    p2.x + s.l3 * Math.sin(s.theta3),
    p2.y - s.l3 * Math.cos(s.theta3),
    origin.z
  );
  return [p1, p2, p3];
}

const PENDULUM_COLORS = ['#ff2244', '#00eeff', '#ffcc00'];

export default function PendulumChaos() {
  const trailMeshRef = useRef<THREE.InstancedMesh>(null);
  const bobMeshRef = useRef<THREE.InstancedMesh>(null);
  const rodMeshRef = useRef<THREE.InstancedMesh>(null);

  const state = useMemo(() => {
    // 3 pendulums with slightly different theta1
    const pendulums: PendulumState[] = [
      { theta1: 2.0, theta2: 1.8, theta3: 1.6, omega1: 0, omega2: 0, omega3: 0, l1: 0.9, l2: 0.7, l3: 0.6, m1: 1, m2: 1, m3: 1 },
      { theta1: 2.0 + 0.0001, theta2: 1.8, theta3: 1.6, omega1: 0, omega2: 0, omega3: 0, l1: 0.9, l2: 0.7, l3: 0.6, m1: 1, m2: 1, m3: 1 },
      { theta1: 2.0 + 0.0002, theta2: 1.8, theta3: 1.6, omega1: 0, omega2: 0, omega3: 0, l1: 0.9, l2: 0.7, l3: 0.6, m1: 1, m2: 1, m3: 1 },
    ];

    // Trail ring buffers
    const trails: THREE.Vector3[][] = pendulums.map(() =>
      Array.from({ length: TRAIL_LENGTH }, () => new THREE.Vector3())
    );
    const trailHeads = [0, 0, 0];
    const origins = [
      new THREE.Vector3(-2.5, 2.2, -1.0),
      new THREE.Vector3(0, 2.2, 0),
      new THREE.Vector3(2.5, 2.2, 1.0),
    ];

    return { pendulums, trails, trailHeads, origins };
  }, []);

  const trailMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
    });
    return mat;
  }, []);

  const bobMats = useMemo(() =>
    PENDULUM_COLORS.map(c => new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 2.5,
      roughness: 0.15,
      metalness: 0.5,
    })),
  []);

  const rodMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#556677',
    roughness: 0.6,
    metalness: 0.4,
  }), []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tmpDir = useMemo(() => new THREE.Vector3(), []);
  const tmpMid = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const frameRef = useRef({ count: 0 });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.025);
    const { pendulums, trails, trailHeads, origins } = state;
    frameRef.current.count++;

    // Integrate each pendulum
    const allPositions: THREE.Vector3[][] = [];
    for (let p = 0; p < PENDULUM_COUNT; p++) {
      // Multiple substeps for accuracy
      for (let i = 0; i < 4; i++) {
        // eslint-disable-next-line react-hooks/immutability
        pendulums[p] = rk4Step(pendulums[p], dt / 4);
      }

      const positions = pendulumPositions(pendulums[p], origins[p]);
      allPositions.push(positions);

      // Add bob3 to trail
      const head = trailHeads[p];
      trails[p][head].copy(positions[2]);
      trailHeads[p] = (head + 1) % TRAIL_LENGTH;
    }

    // Update trail spheres
    const trailMesh = trailMeshRef.current;
    if (trailMesh) {
      let idx = 0;
      for (let p = 0; p < PENDULUM_COUNT; p++) {
        for (let i = 0; i < TRAIL_LENGTH; i++) {
          const age = ((trailHeads[p] - i - 1 + TRAIL_LENGTH) % TRAIL_LENGTH) / TRAIL_LENGTH;
          const scale = 0.025 * (1 - age * 0.8);

          dummy.position.copy(trails[p][(trailHeads[p] - i - 1 + TRAIL_LENGTH) % TRAIL_LENGTH]);
          dummy.scale.setScalar(scale);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          trailMesh.setMatrixAt(idx, dummy.matrix);
          idx++;
        }
      }
      trailMesh.instanceMatrix.needsUpdate = true;
    }

    // Update bob spheres
    const bobMesh = bobMeshRef.current;
    if (bobMesh) {
      let idx = 0;
      for (let p = 0; p < PENDULUM_COUNT; p++) {
        const positions = allPositions[p];
        for (let b = 0; b < 3; b++) {
          dummy.position.copy(positions[b]);
          const scale = b === 2 ? 0.12 : b === 1 ? 0.09 : 0.07;
          dummy.scale.setScalar(scale);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          bobMesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
      bobMesh.instanceMatrix.needsUpdate = true;
    }

    // Update rod cylinders
    const rodMesh = rodMeshRef.current;
    if (rodMesh) {
      let idx = 0;
      for (let p = 0; p < PENDULUM_COUNT; p++) {
        const positions = allPositions[p];
        const segments = [
          [origins[p], positions[0]],
          [positions[0], positions[1]],
          [positions[1], positions[2]],
        ];
        for (const [a, b] of segments) {
          tmpMid.addVectors(a, b).multiplyScalar(0.5);
          tmpDir.subVectors(b as THREE.Vector3, a);
          const len = tmpDir.length();
          if (len > 0.001) {
            tmpDir.normalize();
            tmpQ.setFromUnitVectors(up, tmpDir);
            dummy.position.copy(tmpMid);
            dummy.quaternion.copy(tmpQ);
            dummy.scale.set(0.015, len * 0.5, 0.015);
            dummy.updateMatrix();
            rodMesh.setMatrixAt(idx, dummy.matrix);
          }
          idx++;
        }
      }
      rodMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <color attach="background" args={['#04020a']} />
      <ambientLight intensity={0.1} />
      <directionalLight position={[3, 8, 2]} intensity={0.5} />
      <pointLight position={[-2.5, 2.5, -1]} intensity={20} color="#ff2244" distance={10} />
      <pointLight position={[0, 2.5, 0]} intensity={20} color="#00eeff" distance={10} />
      <pointLight position={[2.5, 2.5, 1]} intensity={20} color="#ffcc00" distance={10} />

      {/* Trail spheres */}
      <instancedMesh
        ref={trailMeshRef}
        args={[undefined, trailMat, TOTAL_TRAIL]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 4, 4]} />
      </instancedMesh>

      {/* Bob spheres */}
      <instancedMesh
        ref={bobMeshRef}
        args={[undefined, bobMats[0], PENDULUM_COUNT * 3]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 12]} />
      </instancedMesh>

      {/* Rods */}
      <instancedMesh
        ref={rodMeshRef}
        args={[undefined, rodMat, PENDULUM_COUNT * 3]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </instancedMesh>

      {/* Pivot points */}
      {[new THREE.Vector3(-2.5, 2.2, -1.0), new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(2.5, 2.2, 1.0)].map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial
            color={PENDULUM_COLORS[i]}
            emissive={PENDULUM_COLORS[i]}
            emissiveIntensity={1.5}
            roughness={0.3}
            metalness={0.5}
          />
        </mesh>
      ))}

      {/* Ceiling bar */}
      <mesh position={[0, 2.35, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 7.0, 8, 1]} />
        <meshStandardMaterial color="#334455" metalness={0.7} roughness={0.3} />
      </mesh>
    </>
  );
}
