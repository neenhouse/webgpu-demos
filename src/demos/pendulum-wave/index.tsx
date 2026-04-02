import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  positionWorld,
  time,
  sin,
  smoothstep,
  mix,
  hash,
} from 'three/tsl';

/**
 * Pendulum Wave — 20 pendulums with slightly different periods
 *
 * Each pendulum has period T_n = 60 / (20 + n), so they gradually
 * go in and out of phase, creating mesmerizing wave patterns.
 * Pure R3F animation — no compute shaders needed.
 *
 * Additional techniques: TSL height-based color gradient on bobs,
 * hash-based twinkle emissive on bobs, BackSide bloom halo shells
 * on the beam, background atmosphere sphere with gradient, 3 colored
 * point lights matching the HSL palette.
 */

const NUM_PENDULUMS = 20;
const MAX_ANGLE = 0.8; // radians
const ROD_LENGTH = 3.5;
const PIVOT_Y = 4;
const X_MIN = -6;
const X_MAX = 6;

interface PendulumData {
  x: number;
  period: number;
  color: THREE.Color;
}

export default function PendulumWave() {
  const pendulumRefs = useRef<(THREE.Group | null)[]>([]);

  // Pre-compute pendulum properties
  const pendulums: PendulumData[] = useMemo(() => {
    const result: PendulumData[] = [];
    for (let n = 0; n < NUM_PENDULUMS; n++) {
      const t = n / (NUM_PENDULUMS - 1);
      const x = X_MIN + t * (X_MAX - X_MIN);
      const period = 60 / (20 + n);
      const color = new THREE.Color().setHSL(n / NUM_PENDULUMS, 0.9, 0.55);
      result.push({ x, period, color });
    }
    return result;
  }, []);

  // Rod material (shared across all rods)
  const rodMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x888888);
    mat.roughness = 0.6;
    mat.metalness = 0.4;
    return mat;
  }, []);

  // Beam material with TSL color
  const beamMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x555555);
    mat.roughness = 0.5;
    mat.metalness = 0.6;
    return mat;
  }, []);

  // TSL bob material: height-based gradient + hash twinkle emissive
  const bobMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // 4-stop color gradient by world Y height
    const colorFn = Fn(() => {
      const py = positionWorld.y.add(float(3.0)).div(float(8.0)).saturate();
      const blue   = vec3(0.1, 0.2, 1.0);
      const cyan   = vec3(0.0, 0.9, 1.0);
      const magenta = vec3(1.0, 0.1, 0.9);
      const white  = vec3(1.0, 1.0, 1.0);
      const t1 = smoothstep(float(0.0), float(0.33), py);
      const t2 = smoothstep(float(0.33), float(0.66), py);
      const t3 = smoothstep(float(0.66), float(1.0), py);
      const c1 = mix(blue, cyan, t1);
      const c2 = mix(c1, magenta, t2);
      return mix(c2, white, t3);
    });
    mat.colorNode = colorFn();

    // Hash-based per-instance twinkle emissive
    const emissiveFn = Fn(() => {
      const h = hash(positionWorld.x.mul(7.1).add(positionWorld.z.mul(3.3)));
      const pulse = sin(time.mul(h.mul(4.0).add(1.0))).mul(float(0.4)).add(float(0.6));
      const py = positionWorld.y.add(float(3.0)).div(float(8.0)).saturate();
      const emCol = mix(
        vec3(0.2, 0.5, 1.0),
        vec3(1.0, 0.2, 0.8),
        py
      );
      return emCol.mul(pulse).mul(float(0.8));
    });
    mat.emissiveNode = emissiveFn();
    mat.roughness = 0.3;
    mat.metalness = 0.2;
    return mat;
  }, []);

  // Bloom halo shell for the beam
  const beamHaloMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    mat.side = THREE.BackSide;
    mat.colorNode = vec3(0.5, 0.6, 1.0).mul(float(0.025));
    return mat;
  }, []);

  // Background atmosphere sphere
  const atmMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    const fn = Fn(() => {
      const py = positionWorld.y.add(float(6.0)).div(float(16.0)).saturate();
      const bottom = vec3(0.01, 0.01, 0.06);
      const top = vec3(0.0, 0.0, 0.03);
      return mix(bottom, top, py);
    });
    mat.colorNode = fn();
    return mat;
  }, []);

  // Shared geometries
  const rodGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.03, 0.03, ROD_LENGTH, 6),
    [],
  );
  const bobGeometry = useMemo(
    () => new THREE.SphereGeometry(0.25, 16, 16),
    [],
  );
  const beamGeometry = useMemo(
    () => new THREE.BoxGeometry(X_MAX - X_MIN + 1.5, 0.15, 0.15),
    [],
  );

  // Animate each pendulum's rotation
  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    for (let n = 0; n < NUM_PENDULUMS; n++) {
      const group = pendulumRefs.current[n];
      if (!group) continue;
      const angle =
        MAX_ANGLE * Math.sin((2 * Math.PI * elapsed) / pendulums[n].period);
      group.rotation.z = angle;
    }
  });

  return (
    <>
      <color attach="background" args={['#00000a']} />

      <fogExp2 attach="fog" color="#030306" density={0.03} />
      {/* Background atmosphere sphere */}
      <mesh material={atmMat}>
        <sphereGeometry args={[30, 16, 10]} />
      </mesh>

      {/* Lighting */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 5]} intensity={1.0} />
      <directionalLight position={[-4, 6, -3]} intensity={0.4} />
      {/* Colored atmosphere lights matching pendulum palette */}
      <pointLight position={[-6, 2, 3]} intensity={3} color="#0066ff" distance={20} />
      <pointLight position={[6, 2, -3]} intensity={3} color="#ff00cc" distance={20} />
      <pointLight position={[0, 6, 0]} intensity={2} color="#00ffaa" distance={25} />

      {/* Horizontal beam at top */}
      <mesh
        geometry={beamGeometry}
        material={beamMaterial}
        position={[0, PIVOT_Y, 0]}
      />
      {/* Beam bloom halo shell */}
      <mesh
        geometry={beamGeometry}
        material={beamHaloMat}
        position={[0, PIVOT_Y, 0]}
        scale={[1.0, 2.5, 2.5]}
      />

      {/* Pendulums */}
      {pendulums.map((p, n) => (
        <group
          key={n}
          position={[p.x, PIVOT_Y, 0]}
        >
          {/* This inner group rotates around the pivot */}
          <group
            ref={(el) => {
              pendulumRefs.current[n] = el;
            }}
          >
            {/* Rod: centered at half rod length below pivot */}
            <mesh
              geometry={rodGeometry}
              material={rodMaterial}
              position={[0, -ROD_LENGTH / 2, 0]}
            />
            {/* Bob: at end of rod — uses shared TSL material */}
            <mesh
              geometry={bobGeometry}
              material={bobMaterial}
              position={[0, -ROD_LENGTH, 0]}
            />
          </group>
        </group>
      ))}
    </>
  );
}
