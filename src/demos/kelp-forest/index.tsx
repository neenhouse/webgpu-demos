import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  instanceIndex,
  mix,
  positionWorld,
  smoothstep,
} from 'three/tsl';

/**
 * Kelp Forest — Underwater kelp strands swaying in current
 *
 * 20 kelp strands: each = chain of 8-12 instanced planes stacked vertically
 * with sine-wave sway via CPU instance transforms.
 * Dark green base, lighter top.
 * 3 light shaft translucent cones with AdditiveBlending.
 * 8 instanced fish ellipsoids swimming between kelp.
 * Sandy floor with scattered rocks. Blue-green fog. 30 instanced bubble spheres rising.
 *
 * Techniques: multi-segment kelp sway, additive light shafts, instanced fish/bubbles.
 */

const KELP_COUNT = 20;
const KELP_SEGMENTS = 10;
const TOTAL_KELP_PLANES = KELP_COUNT * KELP_SEGMENTS;
const FISH_COUNT = 8;
const BUBBLE_COUNT = 30;
const ROCK_COUNT = 15;

interface KelpData {
  basePosition: THREE.Vector3;
  segmentCount: number;
  swayFreq: number;
  swayAmp: number;
  totalHeight: number;
}

export default function KelpForest() {
  const kelpRef = useRef<THREE.InstancedMesh>(null);
  const fishRef = useRef<THREE.InstancedMesh>(null);
  const bubbleRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const totalTimeRef = useRef(0);

  const kelpData = useMemo<KelpData[]>(() =>
    Array.from({ length: KELP_COUNT }, (_, i) => {
      const angle = (i / KELP_COUNT) * Math.PI * 2;
      const r = 1.0 + (i % 4) * 0.8;
      return {
        basePosition: new THREE.Vector3(
          Math.cos(angle) * r + (Math.random() - 0.5) * 0.5,
          -2.5,
          Math.sin(angle) * r + (Math.random() - 0.5) * 0.5,
        ),
        segmentCount: KELP_SEGMENTS,
        swayFreq: 0.6 + Math.random() * 0.5,
        swayAmp: 0.08 + Math.random() * 0.06,
        totalHeight: 4.0 + Math.random() * 2.0,
      };
    }), []);

  // Kelp material: dark green base, lighter top
  const kelpMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const heightFactor = smoothstep(-2.5, 2.0, positionWorld.y);
    const darkGreen = color(0x0d3b0f);
    const midGreen = color(0x1a6c20);
    const lightGreen = color(0x4a9a3a);
    mat.colorNode = mix(darkGreen, mix(midGreen, lightGreen, heightFactor), heightFactor);
    mat.emissiveNode = color(0x0a4010).mul(float(0.2).add(heightFactor.mul(0.3)));
    mat.roughness = 0.8;
    mat.metalness = 0.0;
    mat.side = THREE.DoubleSide;
    mat.transparent = true;
    mat.opacity = 0.9;
    return mat;
  }, []);

  // Fish material: iridescent
  const fishMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    const idxNorm = instanceIndex.toFloat().div(float(FISH_COUNT));
    const freshBlue = color(0x2266ff);
    const yellowFin = color(0xffcc22);
    const silver = color(0xaaddcc);
    const col = mix(mix(freshBlue, yellowFin, idxNorm.mul(2.0).clamp(0.0, 1.0)), silver, idxNorm.sub(0.5).mul(2.0).clamp(0.0, 1.0));
    mat.colorNode = col;
    mat.emissiveNode = col.mul(float(0.15));
    mat.roughness = 0.2;
    mat.metalness = 0.5;
    return mat;
  }, []);

  // Bubble material
  const bubbleMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = color(0xaaeeff);
    mat.emissiveNode = color(0x44aacc).mul(float(0.8));
    mat.roughness = 0.0;
    mat.metalness = 0.5;
    mat.transparent = true;
    mat.opacity = 0.4;
    return mat;
  }, []);

  // Build initial bubble instances
  useEffect(() => {
    const mesh = bubbleRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const angle = (i / BUBBLE_COUNT) * Math.PI * 2;
      const r = 0.5 + (i % 4) * 0.6;
      dummy.position.set(
        Math.cos(angle) * r,
        -2.5 + Math.random() * 5.0,
        Math.sin(angle) * r,
      );
      dummy.scale.setScalar(0.03 + Math.random() * 0.03);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    totalTimeRef.current += delta;
    const t = totalTimeRef.current;
    const dummy = new THREE.Object3D();

    // Animate kelp sway
    const kelpMesh = kelpRef.current;
    if (kelpMesh) {
      for (let k = 0; k < KELP_COUNT; k++) {
        const kelp = kelpData[k];
        const segH = kelp.totalHeight / kelp.segmentCount;

        for (let s = 0; s < kelp.segmentCount; s++) {
          const segIdx = k * KELP_SEGMENTS + s;
          const heightFrac = s / kelp.segmentCount;

          // Wave sway: more movement at top
          const sway = Math.sin(t * kelp.swayFreq + kelp.basePosition.x * 2.0) *
            kelp.swayAmp * heightFrac * heightFrac;
          const swayZ = Math.cos(t * kelp.swayFreq * 0.7 + kelp.basePosition.z * 1.5) *
            kelp.swayAmp * 0.5 * heightFrac;

          const segY = kelp.basePosition.y + s * segH + segH * 0.5;
          // Cumulative offset grows with each segment
          const cumSway = sway * heightFrac * 2;

          dummy.position.set(
            kelp.basePosition.x + cumSway,
            segY,
            kelp.basePosition.z + swayZ * heightFrac,
          );
          dummy.rotation.set(
            sway * 0.5,
            kelp.basePosition.x * 0.3 + s * 0.1,
            sway * 0.8,
          );
          dummy.scale.set(0.18 + heightFrac * 0.08, segH * 0.95, 0.008);
          dummy.updateMatrix();
          kelpMesh.setMatrixAt(segIdx, dummy.matrix);
        }
      }
      kelpMesh.instanceMatrix.needsUpdate = true;
    }

    // Animate fish
    const fishMesh = fishRef.current;
    if (fishMesh) {
      for (let i = 0; i < FISH_COUNT; i++) {
        const phaseOffset = (i / FISH_COUNT) * Math.PI * 2;
        const speed = 0.4 + i * 0.08;
        const ft = t * speed + phaseOffset;
        const x = Math.sin(ft) * 3.0;
        const y = -0.8 + i * 0.5 - 0.5 + Math.sin(ft * 0.4) * 0.3;
        const z = Math.sin(ft * 1.5 + 1.0) * 1.8;
        dummy.position.set(x, y, z);
        dummy.lookAt(
          x + Math.cos(ft) * 2,
          y,
          z + Math.cos(ft * 1.5 + 1.0) * 2.7,
        );
        dummy.scale.set(0.08, 0.05, 0.18);
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
      }
      fishMesh.instanceMatrix.needsUpdate = true;
    }

    // Animate bubbles rising
    const bubbleMesh = bubbleRef.current;
    if (bubbleMesh) {
      for (let i = 0; i < BUBBLE_COUNT; i++) {
        const angle = (i / BUBBLE_COUNT) * Math.PI * 2;
        const r = 0.5 + (i % 4) * 0.6;
        const riseSpeed = 0.3 + (i % 5) * 0.1;
        const y = -2.5 + ((t * riseSpeed + i * 0.3) % 5.0);
        dummy.position.set(
          Math.cos(angle) * r + Math.sin(t * 0.5 + i) * 0.15,
          y,
          Math.sin(angle) * r,
        );
        dummy.scale.setScalar(0.025 + (i % 4) * 0.01);
        dummy.updateMatrix();
        bubbleMesh.setMatrixAt(i, dummy.matrix);
      }
      bubbleMesh.instanceMatrix.needsUpdate = true;
    }

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03;
    }
  });

  const rockPositions = useMemo(() =>
    Array.from({ length: ROCK_COUNT }, (_, i) => ({
      x: (Math.cos(i * 2.1) * 3.5),
      z: (Math.sin(i * 1.7) * 3.5),
      s: 0.12 + (i % 4) * 0.06,
    })), []);

  return (
    <>
      <color attach="background" args={['#001830']} />
      <fog attach="fog" args={['#002244', 8, 18]} />
      <ambientLight intensity={0.3} color="#003355" />
      <directionalLight position={[2, 8, 1]} intensity={0.6} color="#88aaff" />
      <pointLight position={[0, 2, 0]} intensity={4.0} color="#4488ff" distance={12} />
      <pointLight position={[-3, 0, -1]} intensity={2.0} color="#00aaff" distance={8} />
      <pointLight position={[3, -1, 2]} intensity={2.0} color="#22cc88" distance={8} />

      {/* Sandy floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.55, 0]}>
        <planeGeometry args={[12, 12, 4, 4]} />
        <meshStandardMaterial color="#c8a87a" roughness={0.9} />
      </mesh>

      {/* Rocks */}
      {rockPositions.map((r, i) => (
        <mesh
          key={i}
          position={[r.x, -2.45 + r.s * 0.5, r.z]}
        >
          <dodecahedronGeometry args={[r.s, 0]} />
          <meshStandardMaterial color="#665544" roughness={0.95} />
        </mesh>
      ))}

      {/* Light shafts from above */}
      {[-2, 0, 2].map((x, i) => (
        <mesh key={i} position={[x, 3, -1 + i * 0.5]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.4, 7, 5, 1, true]} />
          <meshBasicMaterial
            color="#4488ff"
            transparent
            opacity={0.04}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}

      <group ref={groupRef}>
        {/* Kelp strands */}
        <instancedMesh
          ref={kelpRef}
          args={[undefined, undefined, TOTAL_KELP_PLANES]}
          material={kelpMaterial}
          frustumCulled={false}
        >
          <planeGeometry args={[1, 1, 2, 2]} />
        </instancedMesh>

        {/* Fish */}
        <instancedMesh
          ref={fishRef}
          args={[undefined, undefined, FISH_COUNT]}
          material={fishMaterial}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 6, 4]} />
        </instancedMesh>

        {/* Bubbles */}
        <instancedMesh
          ref={bubbleRef}
          args={[undefined, undefined, BUBBLE_COUNT]}
          material={bubbleMaterial}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 5, 4]} />
        </instancedMesh>
      </group>
    </>
  );
}
