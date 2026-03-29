import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  instanceIndex,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  vec3,
} from 'three/tsl';

/**
 * Crystal Formation — Crystals growing from seed points with animated extension
 *
 * Growth animation: 40 instanced crystals (elongated hexagonal prisms via
 * CylinderGeometry segments=6). Scale Y from 0 to full over 3s, staggered.
 * New crystals branch from existing at angles.
 * Transparent with fresnel refraction (roughness 0.05, metalness 0.1).
 * Emissive glow at bases. Point lights at seeds. Bloom halos on largest.
 *
 * Techniques: staggered growth animation, instanced mesh, TSL fresnel, halo shells.
 */

const CRYSTAL_COUNT = 40;
const CRYSTAL_HALO_COUNT = 40;

interface CrystalData {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  maxHeight: number;
  delay: number;
  colorVariant: number;
}

function buildCrystals(): CrystalData[] {
  const crystals: CrystalData[] = [];

  // Root seed positions
  const seeds = [
    new THREE.Vector3(0, -2, 0),
    new THREE.Vector3(-2, -2, -1),
    new THREE.Vector3(2, -2, 1),
    new THREE.Vector3(-1, -2, 2),
    new THREE.Vector3(1.5, -2, -2),
  ];

  let idx = 0;
  for (let s = 0; s < seeds.length && idx < CRYSTAL_COUNT; s++) {
    const seed = seeds[s];
    // Primary crystal at seed
    const primaryHeight = 1.5 + Math.random() * 1.5;
    crystals.push({
      position: seed.clone(),
      scale: new THREE.Vector3(0.12 + Math.random() * 0.06, primaryHeight, 0.12 + Math.random() * 0.06),
      rotation: new THREE.Euler(
        (Math.random() - 0.5) * 0.2,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.15,
      ),
      maxHeight: primaryHeight,
      delay: s * 0.5,
      colorVariant: s % 3,
    });
    idx++;

    // Secondary branching crystals
    const branchCount = 3 + s;
    for (let b = 0; b < branchCount && idx < CRYSTAL_COUNT; b++) {
      const angle = (b / branchCount) * Math.PI * 2;
      const dist = 0.3 + Math.random() * 0.5;
      const branchPos = seed.clone().add(
        new THREE.Vector3(Math.cos(angle) * dist, Math.random() * 0.4, Math.sin(angle) * dist),
      );
      const h = 0.4 + Math.random() * 1.2;
      crystals.push({
        position: branchPos,
        scale: new THREE.Vector3(0.05 + Math.random() * 0.05, h, 0.05 + Math.random() * 0.05),
        rotation: new THREE.Euler(
          (Math.random() - 0.5) * 0.5 + angle * 0.1,
          angle + Math.random() * 0.5,
          (Math.random() - 0.5) * 0.3,
        ),
        maxHeight: h,
        delay: s * 0.5 + 0.3 + b * 0.15,
        colorVariant: (s + b) % 3,
      });
      idx++;
    }
  }

  return crystals.slice(0, CRYSTAL_COUNT);
}

const GROWTH_DURATION = 3.0;
const CYCLE_DURATION = 8.0;

export default function CrystalFormation() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const totalTimeRef = useRef(0);
  const baseScales = useRef<THREE.Vector3[]>([]);

  const crystals = useMemo(() => buildCrystals(), []);

  // Crystal material: transparent with fresnel
  const crystalMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const idxNorm = instanceIndex.toFloat().div(float(CRYSTAL_COUNT));
    const c0 = color(0xaa44ff); // purple
    const c1 = color(0x44aaff); // blue
    const c2 = color(0x44ffcc); // cyan
    const colBand = idxNorm.mul(3.0).floor().div(2.0);
    const baseCol = mix(mix(c0, c1, smoothstep(0.0, 0.5, colBand)), c2, smoothstep(0.5, 1.0, colBand));

    // Fresnel: brighter on edges
    const fresnel = float(1.0).sub(
      normalWorld.dot(vec3(0, 0, 1)).abs().clamp(0.0, 1.0),
    );
    const fresnelPow = fresnel.pow(float(2.0));

    mat.colorNode = mix(baseCol.mul(0.3), baseCol, fresnelPow);
    mat.emissiveNode = baseCol.mul(fresnelPow.mul(float(1.5)).add(
      smoothstep(-2.5, -1.5, positionWorld.y).mul(1.2),
    ));
    mat.roughness = 0.05;
    mat.metalness = 0.1;
    mat.transparent = true;
    mat.opacity = 0.75;
    return mat;
  }, []);

  // Halo material: additive glow
  const haloMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const idxNorm = instanceIndex.toFloat().div(float(CRYSTAL_HALO_COUNT));
    mat.colorNode = mix(color(0xaa44ff), color(0x44aaff), idxNorm);
    mat.emissiveNode = mix(color(0xaa44ff), color(0x44aaff), idxNorm).mul(float(2.0));
    mat.side = THREE.BackSide;
    mat.transparent = true;
    mat.opacity = 0.025;
    mat.blending = THREE.AdditiveBlending;
    mat.depthWrite = false;
    return mat;
  }, []);

  // Build base instance matrices
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    baseScales.current = crystals.map((c) => c.scale.clone());
    for (let i = 0; i < crystals.length; i++) {
      const c = crystals[i];
      dummy.position.copy(c.position);
      dummy.rotation.copy(c.rotation);
      dummy.scale.set(c.scale.x, 0.001, c.scale.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [crystals]);

  // Build halo matrices
  useEffect(() => {
    const mesh = haloRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < crystals.length; i++) {
      const c = crystals[i];
      dummy.position.copy(c.position);
      dummy.rotation.copy(c.rotation);
      dummy.scale.set(c.scale.x * 2.5, 0.001, c.scale.z * 2.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [crystals]);

  useFrame((_, delta) => {
    totalTimeRef.current += delta;
    const t = totalTimeRef.current % CYCLE_DURATION;
    const dummy = new THREE.Object3D();

    const mesh = meshRef.current;
    const halo = haloRef.current;
    if (!mesh || !halo) return;

    for (let i = 0; i < crystals.length; i++) {
      const c = crystals[i];
      const growT = Math.min(1.0, Math.max(0, (t - c.delay) / GROWTH_DURATION));
      // Ease in cubic
      const eased = growT * growT * (3 - 2 * growT);
      const currentH = c.scale.y * eased;

      // Position: shift up so base stays at seed level
      dummy.position.set(c.position.x, c.position.y + currentH * 0.5, c.position.z);
      dummy.rotation.copy(c.rotation);
      dummy.scale.set(c.scale.x, Math.max(0.001, currentH), c.scale.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Halo follows tip
      dummy.position.set(c.position.x, c.position.y + currentH, c.position.z);
      dummy.scale.set(c.scale.x * 2.5, c.scale.x * 2.5, c.scale.x * 2.5);
      dummy.updateMatrix();
      halo.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <>
      <color attach="background" args={['#080010']} />
      <fog attach="fog" args={['#110022', 8, 20]} />
      <ambientLight intensity={0.2} color="#4422aa" />
      <directionalLight position={[3, 6, 2]} intensity={0.5} color="#aa88ff" />
      <pointLight position={[0, -1.5, 0]} intensity={8.0} color="#8844ff" distance={10} />
      <pointLight position={[-2, -1, -1]} intensity={5.0} color="#44aaff" distance={8} />
      <pointLight position={[2, -1, 1]} intensity={5.0} color="#ff44cc" distance={8} />
      <pointLight position={[1, 2, -2]} intensity={3.0} color="#44ffcc" distance={6} />

      {/* Dark rock base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.05, 0]}>
        <planeGeometry args={[10, 10, 8, 8]} />
        <meshStandardMaterial color="#1a1020" roughness={0.95} metalness={0.1} />
      </mesh>

      {/* Some floor crystal clusters (decorative) */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <mesh
          key={i}
          position={[
            Math.cos((i / 8) * Math.PI * 2) * 3.5,
            -2.0,
            Math.sin((i / 8) * Math.PI * 2) * 3.5,
          ]}
          rotation={[
            (Math.random() - 0.5) * 0.3,
            (i / 8) * Math.PI * 2,
            (Math.random() - 0.5) * 0.2,
          ]}
        >
          <coneGeometry args={[0.08, 0.4 + (i % 3) * 0.2, 6]} />
          <meshStandardMaterial
            color={['#6622cc', '#2266cc', '#22ccaa'][i % 3]}
            emissive={['#440088', '#224488', '#115544'][i % 3]}
            emissiveIntensity={0.5}
            roughness={0.1}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}

      <group ref={groupRef}>
        {/* Main crystal instances */}
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, CRYSTAL_COUNT]}
          material={crystalMaterial}
          frustumCulled={false}
        >
          <cylinderGeometry args={[0.4, 0.8, 1, 6]} />
        </instancedMesh>

        {/* Halo glow shells */}
        <instancedMesh
          ref={haloRef}
          args={[undefined, undefined, CRYSTAL_HALO_COUNT]}
          material={haloMaterial}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 6, 4]} />
        </instancedMesh>
      </group>
    </>
  );
}
