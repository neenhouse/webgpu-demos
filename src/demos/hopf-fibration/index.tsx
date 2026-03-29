import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  cameraPosition,
  positionWorld,
  normalWorld,
  mix,
  smoothstep,
} from 'three/tsl';

const NUM_FIBERS = 30;
const POINTS_PER_FIBER = 100;
const TOTAL_POINTS = NUM_FIBERS * POINTS_PER_FIBER;

// Hopf fibration:
// For each point on S2 (base space), there's a great circle on S3 (Hopf fiber).
// We project S3 -> R3 via stereographic projection.

// Point on S2 parameterized by (theta, phi) [spherical angles]
function s2Point(theta: number, phi: number): [number, number, number] {
  return [
    Math.sin(theta) * Math.cos(phi),
    Math.sin(theta) * Math.sin(phi),
    Math.cos(theta),
  ];
}

// Hopf fiber: for base point (x,y,z) on S2, the fiber is a great circle on S3
// parameterized by t in [0, 2π], then stereographically projected to R3.
function hopfFiber(bx: number, by: number, bz: number, t: number): THREE.Vector3 {
  // S3 point via Hopf map: if base = (sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta))
  // then fiber = (cos(theta/2 + t) * exp(i*phi/2), sin(theta/2 + t) * exp(-i*phi/2))
  // In quaternion: (q1, q2, q3, q4) - 4D unit vector

  // Extract spherical coords from base point
  const theta = Math.acos(Math.max(-1, Math.min(1, bz)));
  const phi = Math.atan2(by, bx);

  const halfTheta = theta / 2;
  const halfPhi = phi / 2;

  // Quaternion on S3
  const q1 = Math.cos(halfTheta + t) * Math.cos(halfPhi);
  const q2 = Math.cos(halfTheta + t) * Math.sin(halfPhi);
  const q3 = Math.sin(halfTheta + t) * Math.cos(halfPhi + Math.PI / 2);
  const q4 = Math.sin(halfTheta + t) * Math.sin(halfPhi + Math.PI / 2);

  // Stereographic projection from S3 to R3: project from (0,0,0,1) pole
  const denom = 1 - q4;
  if (Math.abs(denom) < 1e-8) return new THREE.Vector3(0, 0, 0);

  return new THREE.Vector3(
    (q1 / denom) * 1.5,
    (q2 / denom) * 1.5,
    (q3 / denom) * 1.5,
  );
}

// Rainbow color for fiber index
function fiberColor(i: number): THREE.Color {
  const hue = (i / NUM_FIBERS) * 360;
  const col = new THREE.Color();
  col.setHSL(hue / 360, 1.0, 0.6);
  return col;
}

export default function HopfFibration() {
  const groupRef = useRef<THREE.Group>(null);
  const fiberMeshRefs = useRef<(THREE.InstancedMesh | null)[]>(
    Array.from({ length: NUM_FIBERS }, () => null)
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Rotation uniform for 4D animation
  const rotAngle = useRef(0);

  // Pre-compute fiber base points (evenly spaced on S2)
  const fiberBases = useMemo(() => {
    const bases: [number, number, number][] = [];
    for (let i = 0; i < NUM_FIBERS; i++) {
      // Use Fibonacci sphere sampling for even distribution
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const y = 1 - (i / (NUM_FIBERS - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;
      bases.push([r * Math.cos(theta), y, r * Math.sin(theta)]);
    }
    return bases;
  }, []);

  // Per-fiber materials with rainbow gradient
  const fiberMaterials = useMemo(() => {
    return fiberBases.map((_, i) => {
      const col = fiberColor(i);
      const mat = new THREE.MeshStandardNodeMaterial();

      const glow = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        const f = float(1.0).sub(nDotV).pow(float(3.0));
        return vec3(col.r, col.g, col.b).mul(f).mul(float(3.5));
      });

      mat.colorNode = vec3(col.r * 0.4, col.g * 0.4, col.b * 0.4);
      mat.emissiveNode = glow();
      mat.roughness = 0.2;
      mat.metalness = 0.5;

      return mat;
    });
  }, [fiberBases]);

  const setFiberRef = useCallback((i: number) => (el: THREE.InstancedMesh | null) => {
    fiberMeshRefs.current[i] = el;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    rotAngle.current = t * 0.2; // 4D rotation speed

    for (let fi = 0; fi < NUM_FIBERS; fi++) {
      const mesh = fiberMeshRefs.current[fi];
      if (!mesh) continue;

      const [bx, by, bz] = fiberBases[fi];

      // Rotate the base point on S2 for animation
      const cosR = Math.cos(rotAngle.current * 0.3);
      const sinR = Math.sin(rotAngle.current * 0.3);
      const rbx = bx * cosR - bz * sinR;
      const rbz = bx * sinR + bz * cosR;

      for (let pi = 0; pi < POINTS_PER_FIBER; pi++) {
        const fiberT = (pi / POINTS_PER_FIBER) * Math.PI * 2 + rotAngle.current;
        const pos = hopfFiber(rbx, by, rbz, fiberT);

        const scale = 0.03;
        dummy.position.copy(pos);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(pi, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.08;
    }
  });

  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 4, 4]} intensity={2} color={0x4488ff} />
      <pointLight position={[-4, -2, 3]} intensity={1.5} color={0xff44aa} />
      <pointLight position={[3, 3, -4]} intensity={1.5} color={0x44ffaa} />

      <group ref={groupRef}>
        {fiberBases.map((_, fi) => (
          <instancedMesh
            key={fi}
            ref={setFiberRef(fi)}
            args={[undefined, undefined, POINTS_PER_FIBER]}
            material={fiberMaterials[fi]}
          >
            <sphereGeometry args={[1, 8, 6]} />
          </instancedMesh>
        ))}
      </group>
    </>
  );
}
