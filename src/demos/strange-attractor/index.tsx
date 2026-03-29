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
  sin,
  hash,
  time,
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
  const haloMeshRefs = useRef<(THREE.InstancedMesh | null)[]>([null, null, null]);
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

  // TSL materials per attractor with velocity-based coloring + hash shimmer
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

      // Fresnel emissive glow + hash shimmer
      const fresnel = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        const f = float(1.0).sub(nDotV).pow(float(3.0));
        const hv = hash(positionWorld.x.mul(5.3).add(positionWorld.z.mul(7.1)));
        const shimmer = sin(time.mul(hv.mul(4.0).add(1.0))).mul(float(0.2)).add(float(0.8));
        return vec3(col.r, col.g, col.b).mul(f).mul(float(2.5)).mul(shimmer);
      });
      mat.emissiveNode = fresnel();
      mat.roughness = 0.3;
      mat.metalness = 0.5;

      return mat;
    });
  }, []);

  // BackSide bloom halo materials
  const haloMaterials = useMemo(() => {
    return ATTRACTOR_COLORS.map((col) => {
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.transparent = true;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
      mat.side = THREE.BackSide;
      const fn = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        const rim = float(1.0).sub(nDotV).pow(float(2.5));
        return vec3(col.r, col.g, col.b).mul(rim).mul(float(0.025));
      });
      mat.colorNode = fn();
      return mat;
    });
  }, []);

  // Background atmosphere sphere
  const atmMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const py = positionWorld.y.add(float(4.0)).div(float(10.0)).saturate();
      return mix(vec3(0.02, 0.01, 0.0), vec3(0.0, 0.01, 0.03), py);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Background star particles (50 tiny spheres)
  const starPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 50; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 9 + Math.random() * 4;
      positions.push([
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      ]);
    }
    return positions;
  }, []);

  const starMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    const fn = Fn(() => {
      const hv = hash(positionWorld.x.mul(8.1).add(positionWorld.y.mul(5.7)));
      return vec3(0.8, 0.6, 1.0).mul(hv.mul(0.5).add(0.5));
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Step each attractor forward each frame, updating instance matrices
  useFrame(() => {
    const stepsPerFrame = 3;

    for (let a = 0; a < NUM_ATTRACTORS; a++) {
      const attractor = attractors[a];
      const mesh = meshRefs.current[a];
      const haloMesh = haloMeshRefs.current[a];
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

        // Halo: slightly larger sphere
        dummy.scale.setScalar(scale * 1.8);
        dummy.updateMatrix();
        if (haloMesh) haloMesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (haloMesh) haloMesh.instanceMatrix.needsUpdate = true;
    }

    // Slow rotation of the group
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.003;
    }
  });

  const setMeshRef = useCallback((a: number) => (el: THREE.InstancedMesh | null) => {
    meshRefs.current[a] = el;
  }, []);

  const setHaloMeshRef = useCallback((a: number) => (el: THREE.InstancedMesh | null) => {
    haloMeshRefs.current[a] = el;
  }, []);

  return (
    <>
      <color attach="background" args={['#050205']} />
      {/* Background atmosphere sphere */}
      <mesh material={atmMat}>
        <sphereGeometry args={[15, 16, 10]} />
      </mesh>
      {/* Background stars */}
      {starPositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={starMat}>
          <sphereGeometry args={[0.02, 4, 4]} />
        </mesh>
      ))}
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 3, 5]} intensity={3} color={0xff6600} />
      <pointLight position={[-3, -2, -4]} intensity={2} color={0x0088ff} />
      <pointLight position={[3, 0, -5]} intensity={1.5} color={0xff00ff} />

      <group ref={groupRef}>
        {/* Main attractor trails */}
        {materials.map((mat, a) => (
          <instancedMesh
            key={a}
            ref={setMeshRef(a)}
            args={[undefined, undefined, TRAIL_LENGTH]}
            material={mat}
            frustumCulled={false}
          >
            <icosahedronGeometry args={[1, 0]} />
          </instancedMesh>
        ))}

        {/* Bloom halo shells on trails */}
        {haloMaterials.map((mat, a) => (
          <instancedMesh
            key={`halo-${a}`}
            ref={setHaloMeshRef(a)}
            args={[undefined, undefined, TRAIL_LENGTH]}
            material={mat}
            frustumCulled={false}
          >
            <icosahedronGeometry args={[1, 0]} />
          </instancedMesh>
        ))}
      </group>
    </>
  );
}
