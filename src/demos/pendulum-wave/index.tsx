import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

/**
 * Pendulum Wave — 20 pendulums with slightly different periods
 *
 * Each pendulum has period T_n = 60 / (20 + n), so they gradually
 * go in and out of phase, creating mesmerizing wave patterns.
 * Pure R3F animation — no compute shaders needed.
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

  // Beam material
  const beamMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x555555);
    mat.roughness = 0.5;
    mat.metalness = 0.6;
    return mat;
  }, []);

  // Bob materials (one per pendulum for unique colors + emissive glow)
  const bobMaterials = useMemo(() => {
    return pendulums.map((p) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.color = p.color;
      mat.emissive = p.color.clone();
      mat.emissiveIntensity = 0.4;
      mat.roughness = 0.3;
      mat.metalness = 0.2;
      return mat;
    });
  }, [pendulums]);

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
      {/* Lighting */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 5]} intensity={1.0} />
      <directionalLight position={[-4, 6, -3]} intensity={0.4} />

      {/* Horizontal beam at top */}
      <mesh
        geometry={beamGeometry}
        material={beamMaterial}
        position={[0, PIVOT_Y, 0]}
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
            {/* Bob: at end of rod */}
            <mesh
              geometry={bobGeometry}
              material={bobMaterials[n]}
              position={[0, -ROD_LENGTH, 0]}
            />
          </group>
        </group>
      ))}
    </>
  );
}
