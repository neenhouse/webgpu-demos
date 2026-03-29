import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  positionWorld,
  cameraPosition,
  normalWorld,
  mix,
  smoothstep,
} from 'three/tsl';

// Lorenz attractor parameters
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;

const TRAIL_LENGTH = 1200; // points per attractor
const NUM_ATTRACTORS = 3;
const DT = 0.004;

// 3 different initial conditions to show chaos divergence
const INITIAL_CONDITIONS = [
  { x: 0.1, y: 0.0, z: 0.0 },
  { x: 0.1001, y: 0.0, z: 0.0 },
  { x: 0.0999, y: 0.001, z: 0.0 },
];

// Neon colors per attractor
const ATTRACTOR_COLORS = [
  new THREE.Color(1.0, 0.27, 0.0),  // orange-red
  new THREE.Color(0.0, 0.85, 1.0),  // cyan
  new THREE.Color(0.9, 0.1, 0.9),   // magenta
];

function lorenzStep(x: number, y: number, z: number, dt: number) {
  const dx = SIGMA * (y - x) * dt;
  const dy = (x * (RHO - z) - y) * dt;
  const dz = (x * y - BETA * z) * dt;
  return { x: x + dx, y: y + dy, z: z + dz };
}

interface AttractorState {
  x: number;
  y: number;
  z: number;
  trail: THREE.Vector3[];
  writeHead: number;
}

export default function StrangeAttractor() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([null, null, null]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Initialize 3 attractors with their own trails
  const attractors = useMemo<AttractorState[]>(() => {
    return INITIAL_CONDITIONS.map((ic) => {
      const trail: THREE.Vector3[] = [];
      let { x, y, z } = ic;
      // Pre-warm: integrate for a while before building trail
      for (let i = 0; i < 500; i++) {
        const next = lorenzStep(x, y, z, DT);
        x = next.x; y = next.y; z = next.z;
      }
      // Build initial trail
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        const next = lorenzStep(x, y, z, DT);
        x = next.x; y = next.y; z = next.z;
        trail.push(new THREE.Vector3(x * 0.12, (z - 25) * 0.12, y * 0.12));
      }
      return { x, y, z, trail, writeHead: 0 };
    });
  }, []);

  // TSL materials per attractor with velocity-based coloring
  const materials = useMemo(() => {
    return ATTRACTOR_COLORS.map((col) => {
      const mat = new THREE.MeshStandardNodeMaterial();

      // Color by height (mapped from z/velocity): blue=low, bright=high
      const heightColor = Fn(() => {
        const h = positionWorld.y.add(float(3.0)).div(float(6.0)).saturate();
        const cold = vec3(0.0, 0.1, 0.8);
        const hot = vec3(col.r, col.g, col.b);
        return mix(cold, hot, smoothstep(float(0.0), float(1.0), h));
      });

      mat.colorNode = heightColor();

      // Fresnel emissive glow
      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        const f = float(1.0).sub(nDotV).pow(float(3.0));
        return vec3(col.r, col.g, col.b).mul(f).mul(float(2.5));
      });
      mat.emissiveNode = fresnel();
      mat.roughness = 0.3;
      mat.metalness = 0.5;

      return mat;
    });
  }, []);

  // Step each attractor forward each frame, updating instance matrices
  useFrame(() => {
    const stepsPerFrame = 3;

    for (let a = 0; a < NUM_ATTRACTORS; a++) {
      const attractor = attractors[a];
      const mesh = meshRefs.current[a];
      if (!mesh) continue;

      // Advance attractor and update ring buffer
      for (let s = 0; s < stepsPerFrame; s++) {
        const next = lorenzStep(attractor.x, attractor.y, attractor.z, DT);
        attractor.x = next.x;
        attractor.y = next.y;
        attractor.z = next.z;

        // Scale and store new position in ring buffer
        attractor.trail[attractor.writeHead].set(
          attractor.x * 0.12,
          (attractor.z - 25) * 0.12,
          attractor.y * 0.12,
        );
        attractor.writeHead = (attractor.writeHead + 1) % TRAIL_LENGTH;
      }

      // Rebuild instance matrices from ring buffer
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        const idx = (attractor.writeHead + i) % TRAIL_LENGTH;
        const pos = attractor.trail[idx];
        // Age: 0 = oldest, 1 = newest
        const age = i / TRAIL_LENGTH;
        const scale = 0.015 + age * 0.06;

        dummy.position.copy(pos);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Slow rotation of the group
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.003;
    }
  });

  const setMeshRef = useCallback((a: number) => (el: THREE.InstancedMesh | null) => {
    meshRefs.current[a] = el;
  }, []);

  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 3, 5]} intensity={3} color={0xff6600} />
      <pointLight position={[-3, -2, -4]} intensity={2} color={0x0088ff} />
      <pointLight position={[3, 0, -5]} intensity={1.5} color={0xff00ff} />

      <group ref={groupRef}>
        {materials.map((mat, a) => (
          <instancedMesh
            key={a}
            ref={setMeshRef(a)}
            args={[undefined, undefined, TRAIL_LENGTH]}
            material={mat}
          >
            <icosahedronGeometry args={[1, 0]} />
          </instancedMesh>
        ))}
      </group>
    </>
  );
}
