import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  positionWorld,
  normalLocal,
  Fn,
  float,
  vec3,
  mix,
  smoothstep,
  hash,
  time,
  sin,
} from 'three/tsl';

/**
 * Beat Pulse Grid — 400 pillars pulsing to simulated beat frequencies
 *
 * Techniques: instanced mesh, CPU-driven audio simulation, hash-based
 * per-instance variation, 4-stop height-based color gradient.
 *
 * Simulates 4 frequency bands (sub-bass, bass, mid, high) using sharp
 * sine pulses. Each pillar responds to its assigned band based on column
 * position with added per-instance variation from hash noise.
 *
 * Additional: BackSide halo shells (2) on floor for bloom reflection,
 * instanced background ambient particles (50), 3 colored atmosphere
 * point lights, subtle vertex breathing on pillar tops.
 */

const GRID_SIZE = 20;
const PILLAR_COUNT = GRID_SIZE * GRID_SIZE;
const SPACING = 0.6;

const floorMat = (() => {
  const m = new THREE.MeshStandardNodeMaterial();
  m.color.set(0x050520);
  m.roughness = 0.1;
  m.metalness = 0.9;
  return m;
})();

// Floor halo material (BackSide additive bloom reflection)
const floorHaloMat1 = (() => {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.blending = THREE.AdditiveBlending;
  mat.depthWrite = false;
  mat.side = THREE.BackSide;
  const fn = Fn(() => {
    const dist = positionWorld.x.mul(positionWorld.x).add(positionWorld.z.mul(positionWorld.z)).sqrt();
    const radial = smoothstep(float(15.0), float(0.0), dist).mul(float(0.03));
    const pulse = sin(time.mul(2.0)).mul(float(0.3)).add(float(0.7));
    return vec3(1.0, 0.1, 0.8).mul(radial).mul(pulse);
  });
  mat.colorNode = fn();
  return mat;
})();

const floorHaloMat2 = (() => {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.blending = THREE.AdditiveBlending;
  mat.depthWrite = false;
  mat.side = THREE.BackSide;
  const fn = Fn(() => {
    const dist = positionWorld.x.mul(positionWorld.x).add(positionWorld.z.mul(positionWorld.z)).sqrt();
    const radial = smoothstep(float(12.0), float(0.0), dist).mul(float(0.02));
    return vec3(0.0, 0.8, 1.0).mul(radial);
  });
  mat.colorNode = fn();
  return mat;
})();

export default function BeatPulseGrid() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Frequency band amplitudes updated each frame
  const freqBands = useRef({ sub: 0, bass: 0, mid: 0, high: 0 });
  const baseHeights = useMemo(() => {
    const heights: number[] = [];
    for (let i = 0; i < PILLAR_COUNT; i++) {
      heights.push(0.05 + Math.random() * 0.15);
    }
    return heights;
  }, []);

  // Background ambient particles (50 tiny floating spheres)
  const ambientParticlePositions = useMemo(() => {
    const pos: [number, number, number][] = [];
    for (let i = 0; i < 50; i++) {
      pos.push([
        (Math.random() - 0.5) * 20,
        Math.random() * 6,
        (Math.random() - 0.5) * 20,
      ]);
    }
    return pos;
  }, []);

  const particleMat = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    const fn = Fn(() => {
      const h = hash(positionWorld.x.mul(4.1).add(positionWorld.y.mul(7.3)));
      const twinkle = sin(time.mul(h.mul(4.0).add(1.0))).mul(float(0.4)).add(float(0.6));
      return mix(vec3(0.0, 0.8, 1.0), vec3(1.0, 0.1, 0.8), h).mul(twinkle).mul(float(0.5));
    });
    mat.colorNode = fn();
    mat.opacity = 0.6;
    return mat;
  }, []);

  // Initialize instance matrices flat
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < PILLAR_COUNT; i++) {
      const col = i % GRID_SIZE;
      const row = Math.floor(i / GRID_SIZE);
      const x = (col - GRID_SIZE / 2 + 0.5) * SPACING;
      const z = (row - GRID_SIZE / 2 + 0.5) * SPACING;
      dummy.position.set(x, 0.5, z);
      dummy.scale.set(0.4, 1.0, 0.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  // TSL material: 4-stop color gradient based on world-Y height
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const colorFn = Fn(() => {
      const py = positionWorld.y;
      // 4-stop gradient: blue (0) -> cyan (0.4) -> magenta (0.8) -> white (2+)
      const blue = vec3(0.1, 0.2, 1.0);
      const cyan = vec3(0.0, 0.9, 1.0);
      const magenta = vec3(1.0, 0.1, 0.8);
      const white = vec3(1.0, 1.0, 1.0);

      const t1 = smoothstep(float(0.0), float(0.4), py);
      const t2 = smoothstep(float(0.4), float(0.8), py);
      const t3 = smoothstep(float(0.8), float(2.0), py);

      const c1 = mix(blue, cyan, t1);
      const c2 = mix(c1, magenta, t2);
      return mix(c2, white, t3);
    });

    mat.colorNode = colorFn();

    // Emissive glow based on height and hash variation
    const emissiveFn = Fn(() => {
      const py = positionWorld.y;
      const h = hash(positionWorld.xz.floor());
      const intensity = smoothstep(float(0.5), float(2.5), py).mul(h.mul(0.5).add(0.5));
      return vec3(1.0, 0.3, 0.8).mul(intensity).mul(float(1.5));
    });
    mat.emissiveNode = emissiveFn();

    // Subtle vertex breathing on pillar tips
    mat.positionNode = positionWorld.add(
      normalLocal.mul(
        float(0.01).mul(
          smoothstep(float(0.8), float(1.0), positionWorld.y.div(float(3.0)))
        )
      )
    );

    mat.roughness = 0.3;
    mat.metalness = 0.7;

    return mat;
  }, []);

  useFrame(() => {
    const t = performance.now() * 0.001;
    const mesh = meshRef.current;
    if (!mesh) return;

    // Simulate frequency bands with sharp beat pulses
    freqBands.current.sub = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 2.0)), 8);
    freqBands.current.bass = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 2.0 + 0.3)), 6);
    freqBands.current.mid = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 4.0 + 0.5)), 4) * 0.7;
    freqBands.current.high = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 8.0)), 3) * 0.5;

    const { sub, bass, mid, high } = freqBands.current;

    for (let i = 0; i < PILLAR_COUNT; i++) {
      const col = i % GRID_SIZE;
      const row = Math.floor(i / GRID_SIZE);
      const x = (col - GRID_SIZE / 2 + 0.5) * SPACING;
      const z = (row - GRID_SIZE / 2 + 0.5) * SPACING;

      // Band assignment based on column
      const bandFactor = col / GRID_SIZE;
      let amp: number;
      if (bandFactor < 0.25) {
        amp = sub;
      } else if (bandFactor < 0.5) {
        amp = bass;
      } else if (bandFactor < 0.75) {
        amp = mid;
      } else {
        amp = high;
      }

      // Per-row ripple offset
      const rowOffset = Math.sin(row * 0.5 + t * 3.0) * 0.15;
      const h = baseHeights[i] + amp * 3.0 + rowOffset * amp;

      dummy.position.set(x, h * 0.5, z);
      dummy.scale.set(0.42, h, 0.42);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <color attach="background" args={['#050510']} />
      <ambientLight intensity={0.05} />
      <directionalLight position={[5, 15, 5]} intensity={0.4} color="#ffffff" />
      <pointLight position={[0, 5, 0]} intensity={8} color="#ff22ff" distance={20} />
      <pointLight position={[-5, 3, -5]} intensity={4} color="#0088ff" distance={15} />
      <pointLight position={[5, 3, 5]} intensity={4} color="#00ffcc" distance={15} />

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, PILLAR_COUNT]}
        material={material}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Floor reflection plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} material={floorMat}>
        <planeGeometry args={[30, 30]} />
      </mesh>

      {/* Floor bloom halo shells */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} material={floorHaloMat1}>
        <planeGeometry args={[32, 32]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} material={floorHaloMat2}>
        <planeGeometry args={[34, 34]} />
      </mesh>

      {/* Ambient background particles */}
      {ambientParticlePositions.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={particleMat}>
          <sphereGeometry args={[0.035, 4, 4]} />
        </mesh>
      ))}
    </>
  );
}
