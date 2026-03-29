import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  hash,
  instanceIndex,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  time,
} from 'three/tsl';

/**
 * Flower Bloom — Time-lapse flower opening with petal unfurling animation
 *
 * 3 flowers at different stages. Each: central sphere pistil + 8-12 petal planes.
 * Bloom: petals rotate from closed (vertical) to open (horizontal) over 5s, staggered.
 * Petal material: gradient deep pink to light pink, translucent.
 * 50 instanced pollen spheres when open. Stem + leaves.
 * Soft lighting, garden ground.
 *
 * Techniques: procedural bloom animation, petal rotation, pollen particles.
 */

interface FlowerConfig {
  position: THREE.Vector3;
  petalCount: number;
  petalColor: string;
  petalTip: string;
  pistilColor: string;
  delay: number;
  scale: number;
}

const FLOWERS: FlowerConfig[] = [
  { position: new THREE.Vector3(-1.5, 0, 0), petalCount: 8, petalColor: '#ff3388', petalTip: '#ffaacc', pistilColor: '#ffee44', delay: 0, scale: 1.0 },
  { position: new THREE.Vector3(0, 0.2, 0.5), petalCount: 12, petalColor: '#ff88aa', petalTip: '#ffe0ee', pistilColor: '#ff8800', delay: 2.5, scale: 1.3 },
  { position: new THREE.Vector3(1.8, 0, -0.3), petalCount: 10, petalColor: '#cc44ff', petalTip: '#eebbff', pistilColor: '#ffdd00', delay: 5.0, scale: 0.9 },
];

const BLOOM_DURATION = 5.0;
const CYCLE_DURATION = 14.0;
const POLLEN_COUNT = 60;

// Petal geometry: elongated plane with rounded tip feel
const PETAL_SEGMENTS_PER_FLOWER = 12;
const MAX_PETALS = 36; // 12 per flower max * 3 flowers

export default function FlowerBloom() {
  const petalRefs = useRef<(THREE.Mesh | null)[]>([]);
  const pollenRef = useRef<THREE.InstancedMesh>(null);
  const totalTimeRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  // Flower petal state arrays
  const petalData = useMemo(() => {
    const data: Array<{
      flower: number;
      petalIndex: number;
      baseAngle: number;
      openAngle: number;
      closedTilt: number;
    }> = [];

    for (let f = 0; f < FLOWERS.length; f++) {
      const flower = FLOWERS[f];
      for (let p = 0; p < flower.petalCount; p++) {
        data.push({
          flower: f,
          petalIndex: p,
          baseAngle: (p / flower.petalCount) * Math.PI * 2,
          openAngle: -(Math.PI * 0.35 + Math.random() * 0.2),
          closedTilt: Math.PI * 0.5 - 0.1,
        });
      }
    }
    return data;
  }, []);

  // Pollen material
  const pollenMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const idxNorm = instanceIndex.toFloat().div(float(POLLEN_COUNT));
    mat.colorNode = mix(color(0xffee22), color(0xffaa44), idxNorm);
    mat.emissiveNode = color(0xddcc00).mul(float(1.5));
    mat.roughness = 0.3;
    return mat;
  }, []);

  // Build pollen instance matrices
  useEffect(() => {
    const mesh = pollenRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < POLLEN_COUNT; i++) {
      const flowerIdx = i % FLOWERS.length;
      const flower = FLOWERS[flowerIdx];
      const angle = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.5;
      dummy.position.set(
        flower.position.x + Math.cos(angle) * r,
        flower.position.y + 0.3 + Math.random() * 0.4,
        flower.position.z + Math.sin(angle) * r,
      );
      dummy.scale.setScalar(0.02 + Math.random() * 0.02);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = 0;
  }, []);

  useFrame((_, delta) => {
    totalTimeRef.current += delta;
    const t = totalTimeRef.current % CYCLE_DURATION;

    // Animate petal refs
    let petalIdx = 0;
    for (let f = 0; f < FLOWERS.length; f++) {
      const flower = FLOWERS[f];
      const elapsed = Math.max(0, t - flower.delay);
      const progress = Math.min(1.0, elapsed / BLOOM_DURATION);
      const eased = progress * progress * (3 - 2 * progress);

      for (let p = 0; p < flower.petalCount; p++) {
        const ref = petalRefs.current[petalIdx];
        if (ref) {
          // Petal opens from vertical to horizontal (rotates back)
          const closedAngle = Math.PI * 0.45;
          const openAngle = -Math.PI * 0.1;
          const currentAngle = closedAngle + (openAngle - closedAngle) * eased;
          // Stagger each petal slightly
          const staggerProgress = Math.min(1.0, Math.max(0, (elapsed - p * 0.05) / BLOOM_DURATION));
          const staggerEased = staggerProgress * staggerProgress * (3 - 2 * staggerProgress);
          const staggerAngle = closedAngle + (openAngle - closedAngle) * staggerEased;
          ref.rotation.x = staggerAngle;
        }
        petalIdx++;
      }
    }

    // Pollen: appear when flowers are blooming
    const pollen = pollenRef.current;
    if (pollen) {
      let pollenCount = 0;
      for (let f = 0; f < FLOWERS.length; f++) {
        const elapsed = Math.max(0, t - FLOWERS[f].delay);
        const progress = Math.min(1.0, elapsed / BLOOM_DURATION);
        if (progress > 0.6) pollenCount += Math.floor(POLLEN_COUNT / FLOWERS.length);
      }
      // Animate pollen floating
      const dummy = new THREE.Object3D();
      for (let i = 0; i < POLLEN_COUNT; i++) {
        const flowerIdx = i % FLOWERS.length;
        const flower = FLOWERS[flowerIdx];
        const angle = (i / POLLEN_COUNT) * Math.PI * 2 * 5 + t * 0.3;
        const r = 0.15 + (i % 5) * 0.08;
        dummy.position.set(
          flower.position.x + Math.cos(angle) * r,
          flower.position.y + 0.35 + Math.sin(t * 0.5 + i * 0.3) * 0.08,
          flower.position.z + Math.sin(angle) * r,
        );
        dummy.scale.setScalar(0.02 + (i % 3) * 0.01);
        dummy.updateMatrix();
        pollen.setMatrixAt(i, dummy.matrix);
      }
      pollen.instanceMatrix.needsUpdate = true;
      pollen.count = pollenCount;
    }
  });

  // Build petal JSX
  const petalElements = useMemo(() => {
    const elements: JSX.Element[] = [];
    let idx = 0;
    for (let f = 0; f < FLOWERS.length; f++) {
      const flower = FLOWERS[f];
      const scale = flower.scale;
      for (let p = 0; p < flower.petalCount; p++) {
        const angle = (p / flower.petalCount) * Math.PI * 2;
        const key = `${f}-${p}`;
        const localIdx = idx;
        elements.push(
          <group
            key={key}
            position={[flower.position.x, flower.position.y + 0.18 * scale, flower.position.z]}
            rotation={[0, angle, 0]}
          >
            <mesh
              ref={(el) => { petalRefs.current[localIdx] = el; }}
              position={[0, 0.22 * scale, 0]}
              rotation={[Math.PI * 0.45, 0, 0]}
            >
              <planeGeometry args={[0.18 * scale, 0.35 * scale, 2, 4]} />
              <meshStandardMaterial
                color={flower.petalColor}
                emissive={flower.petalTip}
                emissiveIntensity={0.15}
                roughness={0.6}
                transparent
                opacity={0.88}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>,
        );
        idx++;
      }
    }
    return elements;
  }, []);

  return (
    <>
      <color attach="background" args={['#aaddbb']} />
      <fog attach="fog" args={['#c8eec8', 10, 20]} />
      <ambientLight intensity={0.9} color="#ffffee" />
      <directionalLight position={[4, 8, 3]} intensity={1.5} color="#fff8e7" />
      <directionalLight position={[-2, 4, -3]} intensity={0.5} color="#aaddff" />
      <pointLight position={[0, 1.5, 0]} intensity={4.0} color="#ffee88" distance={8} />

      {/* Garden ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.0, 0]}>
        <planeGeometry args={[12, 12, 4, 4]} />
        <meshStandardMaterial color="#2d6a20" roughness={0.9} />
      </mesh>

      {/* Grass tufts */}
      {Array.from({ length: 40 }, (_, i) => (
        <mesh
          key={i}
          position={[
            (Math.sin(i * 2.3) * 4),
            -1.9,
            (Math.cos(i * 1.7) * 4),
          ]}
          rotation={[0, i * 0.8, 0]}
        >
          <coneGeometry args={[0.025, 0.22, 3]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#3a8028' : '#2d6020'} roughness={0.8} />
        </mesh>
      ))}

      {/* Flower stems */}
      {FLOWERS.map((flower, i) => (
        <group key={i}>
          <mesh position={[flower.position.x, -0.9 * flower.scale, flower.position.z]}>
            <cylinderGeometry args={[0.025 * flower.scale, 0.035 * flower.scale, 2.0 * flower.scale, 5]} />
            <meshStandardMaterial color="#2a6018" roughness={0.8} />
          </mesh>
          {/* Leaves */}
          <mesh
            position={[flower.position.x + 0.15 * flower.scale, -0.6 * flower.scale, flower.position.z]}
            rotation={[0, 0, Math.PI * 0.3]}
          >
            <planeGeometry args={[0.25 * flower.scale, 0.12 * flower.scale]} />
            <meshStandardMaterial color="#338822" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
          <mesh
            position={[flower.position.x - 0.15 * flower.scale, -0.3 * flower.scale, flower.position.z]}
            rotation={[0, 0, -Math.PI * 0.3]}
          >
            <planeGeometry args={[0.22 * flower.scale, 0.1 * flower.scale]} />
            <meshStandardMaterial color="#2d7a1e" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
          {/* Pistil */}
          <mesh position={[flower.position.x, flower.position.y + 0.15 * flower.scale, flower.position.z]}>
            <sphereGeometry args={[0.09 * flower.scale, 8, 6]} />
            <meshStandardMaterial
              color={flower.pistilColor}
              emissive={flower.pistilColor}
              emissiveIntensity={0.5}
              roughness={0.5}
            />
          </mesh>
        </group>
      ))}

      {/* Petals */}
      {petalElements}

      {/* Pollen particles */}
      <instancedMesh
        ref={pollenRef}
        args={[undefined, undefined, POLLEN_COUNT]}
        material={pollenMaterial}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 5, 4]} />
      </instancedMesh>
    </>
  );
}
