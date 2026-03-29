import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  positionLocal,
  smoothstep,
} from 'three/tsl';

/**
 * Neon Noir — Rain-soaked neon street
 *
 * Techniques:
 * 1. Ground plane with wet reflection (dark, high metalness)
 * 2. 6 neon sign rectangles with strong emissive (red, blue, pink)
 * 3. 500 instanced thin cylinder rain streaks falling
 * 4. 3 translucent cone meshes with AdditiveBlending (volumetric light)
 * 5. Desaturated base + neon pops
 * 6. Distance fog
 */

const RAIN_COUNT = 500;
const NEON_COLORS = [
  new THREE.Color(0xff0033),
  new THREE.Color(0x0033ff),
  new THREE.Color(0xff0099),
  new THREE.Color(0x00ffcc),
  new THREE.Color(0xff6600),
  new THREE.Color(0xcc00ff),
];

function seededRand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function NeonNoir() {
  const rainRef = useRef<THREE.InstancedMesh>(null);
  const rainTime = useMemo(() => ({ current: 0 }), []);

  // ── Ground material (wet reflective) ──
  const groundMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x050508);
    mat.metalness = 0.85;
    mat.roughness = 0.12;
    mat.emissive = new THREE.Color(0x010103);
    return mat;
  }, []);

  // ── Building/wall material ──
  const buildingMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.color = new THREE.Color(0x0a0a12);
    mat.roughness = 0.9;
    mat.metalness = 0.1;
    return mat;
  }, []);

  // ── Neon sign materials ──
  const neonMats = useMemo(() => {
    return NEON_COLORS.map((c) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.color = c;
      mat.emissive = c;
      mat.emissiveIntensity = 2.5;
      mat.roughness = 1.0;
      mat.metalness = 0.0;
      return mat;
    });
  }, []);

  // ── Rain material — thin vertical cylinders ──
  const rainMat = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.color = new THREE.Color(0xaaccff);
    mat.emissive = new THREE.Color(0x2244aa);
    mat.emissiveIntensity = 0.5;
    mat.roughness = 0.0;
    mat.metalness = 0.0;
    mat.opacityNode = float(0.35);
    return mat;
  }, []);

  // ── Volumetric light cone materials ──
  const volLightMats = useMemo(() => {
    return [
      { color: new THREE.Color(0xff0033), pos: [-4, 8, -5] as [number, number, number] },
      { color: new THREE.Color(0x0033ff), pos: [0, 8, -8] as [number, number, number] },
      { color: new THREE.Color(0xff00cc), pos: [4, 8, -5] as [number, number, number] },
    ].map(({ color, pos }) => {
      const mat = new THREE.MeshStandardNodeMaterial();
      mat.transparent = true;
      mat.side = THREE.FrontSide;
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
      mat.color = color;
      mat.emissive = color;
      mat.emissiveIntensity = 0.8;
      mat.roughness = 1.0;
      mat.metalness = 0.0;

      // Fade from top (bright) to bottom (transparent)
      mat.opacityNode = Fn(() => {
        const localY = positionLocal.y;
        // Cone tip at top (y=0 in local), base at bottom (y=-1)
        const fade = smoothstep(float(-1.0), float(-0.2), localY);
        return float(0.12).mul(fade);
      })();

      return { mat, pos };
    });
  }, []);

  // Set up rain drop positions
  useEffect(() => {
    const mesh = rainRef.current;
    if (!mesh) return;
    const mat4 = new THREE.Matrix4();
    for (let i = 0; i < RAIN_COUNT; i++) {
      const x = (seededRand(i * 3.7) - 0.5) * 20;
      const y = seededRand(i * 3.7 + 1) * 12;
      const z = (seededRand(i * 3.7 + 2) - 0.5) * 16;
      mat4.makeScale(0.02, 0.3 + seededRand(i * 3.7 + 3) * 0.4, 0.02);
      mat4.setPosition(x, y, z);
      mesh.setMatrixAt(i, mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const scratchMat4 = useMemo(() => new THREE.Matrix4(), []);
  const scratchPos = useMemo(() => new THREE.Vector3(), []);
  const scratchScale = useMemo(() => new THREE.Vector3(), []);
  const scratchQuat = useMemo(() => new THREE.Quaternion(), []);

  // Animate rain
  useFrame((_, delta) => {
    rainTime.current += delta;
    const mesh = rainRef.current;
    if (!mesh) return;

    const mat4 = scratchMat4;
    const pos = scratchPos;
    const scale = scratchScale;
    const quat = scratchQuat;

    for (let i = 0; i < RAIN_COUNT; i++) {
      mesh.getMatrixAt(i, mat4);
      mat4.decompose(pos, quat, scale);

      const fallSpeed = 8.0 + seededRand(i * 5.1 + 4) * 6;
      pos.y -= delta * fallSpeed;

      if (pos.y < -1.0) {
        pos.y = 12.0 + seededRand(rainTime.current * 0.1 + i) * 3;
        pos.x = (seededRand(rainTime.current * 0.17 + i) - 0.5) * 20;
        pos.z = (seededRand(rainTime.current * 0.23 + i) - 0.5) * 16;
      }

      mat4.compose(pos, quat, scale);
      mesh.setMatrixAt(i, mat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {/* Dark ambient */}
      <ambientLight intensity={0.05} color="#0a0010" />

      {/* Neon point lights */}
      <pointLight position={[-4, 3, -3]} intensity={4} color="#ff0033" distance={12} />
      <pointLight position={[3, 4, -6]} intensity={3} color="#0033ff" distance={15} />
      <pointLight position={[0, 3, -2]} intensity={2.5} color="#ff00cc" distance={10} />
      <pointLight position={[5, 2, -4]} intensity={2} color="#00ffcc" distance={12} />

      {/* Ground plane */}
      <mesh material={groundMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[30, 30]} />
      </mesh>

      {/* Background buildings (left wall) */}
      <mesh material={buildingMat} position={[-8, 5, -12]}>
        <boxGeometry args={[8, 10, 1]} />
      </mesh>
      <mesh material={buildingMat} position={[8, 7, -12]}>
        <boxGeometry args={[8, 14, 1]} />
      </mesh>
      <mesh material={buildingMat} position={[0, 4, -12]}>
        <boxGeometry args={[6, 8, 1]} />
      </mesh>

      {/* Side walls */}
      <mesh material={buildingMat} position={[-10, 4, -6]}>
        <boxGeometry args={[1, 8, 12]} />
      </mesh>
      <mesh material={buildingMat} position={[10, 4, -6]}>
        <boxGeometry args={[1, 8, 12]} />
      </mesh>

      {/* Neon signs */}
      <mesh material={neonMats[0]} position={[-6, 4, -10]}>
        <boxGeometry args={[2.5, 0.6, 0.1]} />
      </mesh>
      <mesh material={neonMats[1]} position={[-4, 6, -10]}>
        <boxGeometry args={[1.5, 0.5, 0.1]} />
      </mesh>
      <mesh material={neonMats[2]} position={[4, 5, -10]}>
        <boxGeometry args={[3.0, 0.5, 0.1]} />
      </mesh>
      <mesh material={neonMats[3]} position={[7, 3.5, -10]}>
        <boxGeometry args={[1.8, 0.4, 0.1]} />
      </mesh>
      <mesh material={neonMats[4]} position={[-7, 2.5, -10]}>
        <boxGeometry args={[2.0, 0.4, 0.1]} />
      </mesh>
      <mesh material={neonMats[5]} position={[1, 7, -10]}>
        <boxGeometry args={[2.5, 0.6, 0.1]} />
      </mesh>

      {/* Additional neon on side walls */}
      <mesh material={neonMats[0]} position={[-9.3, 3, -4]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[3.0, 0.5, 0.1]} />
      </mesh>
      <mesh material={neonMats[2]} position={[9.3, 5, -7]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[2.5, 0.5, 0.1]} />
      </mesh>

      {/* Rain */}
      <instancedMesh ref={rainRef} args={[undefined, undefined, RAIN_COUNT]} material={rainMat} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 3, 1]} />
      </instancedMesh>

      {/* Volumetric light cones */}
      {volLightMats.map(({ mat, pos }, i) => (
        <mesh key={i} material={mat} position={pos}>
          <coneGeometry args={[2.5, 10, 12, 1, true]} />
        </mesh>
      ))}

      {/* Fog */}
      <fog attach="fog" args={['#000005', 15, 35]} />
    </>
  );
}
