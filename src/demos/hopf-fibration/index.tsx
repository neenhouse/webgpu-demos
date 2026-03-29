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
  sin,
  hash,
  time,
  smoothstep,
} from 'three/tsl';

const NUM_FIBERS = 30;
const POINTS_PER_FIBER = 100;

// Hopf fibration:
// For each point on S2 (base space), there's a great circle on S3 (Hopf fiber).
// We project S3 -> R3 via stereographic projection.

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

  // Per-fiber materials with rainbow gradient + hash twinkle emissive
  const fiberMaterials = useMemo(() => {
    return fiberBases.map((_, i) => {
      const col = fiberColor(i);
      const mat = new THREE.MeshStandardNodeMaterial();

      const glow = Fn(() => {
        const viewDir = cameraPosition.sub(positionWorld).normalize();
        const nDotV = normalWorld.dot(viewDir).saturate();
        const f = float(1.0).sub(nDotV).pow(float(3.0));
        const h = hash(positionWorld.x.mul(5.3).add(positionWorld.z.mul(7.1)));
        const pulse = sin(time.mul(h.mul(3.0).add(float(i * 0.3)))).mul(float(0.2)).add(float(0.8));
        return vec3(col.r, col.g, col.b).mul(f).mul(float(3.5)).mul(pulse);
      });

      mat.colorNode = vec3(col.r * 0.4, col.g * 0.4, col.b * 0.4);
      mat.emissiveNode = glow();
      mat.roughness = 0.2;
      mat.metalness = 0.5;

      return mat;
    });
  }, [fiberBases]);

  // BackSide bloom halo material for the whole structure
  const haloMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const rim = float(1.0).sub(nDotV).pow(float(2.5));
      const t = time.mul(0.5);
      const r = sin(t).mul(float(0.5)).add(float(0.5));
      const g = sin(t.add(float(2.1))).mul(float(0.5)).add(float(0.5));
      const b = sin(t.add(float(4.2))).mul(float(0.5)).add(float(0.5));
      return vec3(r, g, b).mul(rim).mul(float(0.03));
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Background atmosphere sphere
  const atmMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const py = positionWorld.y.add(float(4.0)).div(float(10.0)).saturate();
      return mix(vec3(0.0, 0.01, 0.04), vec3(0.0, 0.0, 0.01), py);
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
      const r = 7 + Math.random() * 3;
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
      const h = hash(positionWorld.x.mul(7.3).add(positionWorld.y.mul(11.1)));
      const glow = smoothstep(float(0.0), float(1.0), h).mul(float(0.8)).add(float(0.2));
      return vec3(0.7, 0.8, 1.0).mul(glow);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

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
      <color attach="background" args={['#000108']} />
      {/* Background atmosphere sphere */}
      <mesh material={atmMat}>
        <sphereGeometry args={[12, 16, 10]} />
      </mesh>
      {/* Background stars */}
      {starPositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={starMat}>
          <sphereGeometry args={[0.02, 4, 4]} />
        </mesh>
      ))}
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
            frustumCulled={false}
          >
            <sphereGeometry args={[1, 8, 6]} />
          </instancedMesh>
        ))}

        {/* Halo shell around the fibration volume */}
        <mesh scale={4.5} material={haloMat}>
          <sphereGeometry args={[1, 16, 10]} />
        </mesh>
      </group>
    </>
  );
}
