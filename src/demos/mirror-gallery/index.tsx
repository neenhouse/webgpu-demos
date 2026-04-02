import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  normalWorld,
  cameraPosition,
  positionWorld,
  Fn,
  float,
  time,
  oscSine,
  mix,
  vec3,
  positionLocal,
  normalLocal,
} from 'three/tsl';

/**
 * Mirror Gallery — Reflective corridor with glowing geometric sculptures
 *
 * Since MeshReflectorMaterial may not work with WebGPURenderer, we simulate
 * reflections using a Y-flipped duplicate of the scene rendered below the
 * floor plane, masked by a semi-transparent mirror floor.
 *
 * Architecture:
 * - Long corridor: 10 arched wall segments (instanced torus for arches)
 * - Mirror floor: dark, highly metallic plane
 * - Reflection layer: Y-flipped duplicate geometry below floor
 * - 7 sculptures: glowing geometric objects (sphere, torus, octahedron, etc.)
 * - Moody lighting: colored point lights at each sculpture
 * - Fog-like atmosphere via BackSide gradient sphere
 */

const SCULPTURE_DATA = [
  { x: -1.5, z: 0, color: 0xff3366, emissive: 0xff0044, type: 'sphere', phase: 0 },
  { x: 1.5, z: -2.5, color: 0x33aaff, emissive: 0x0077ff, type: 'octahedron', phase: 1.2 },
  { x: -1.5, z: -5, color: 0xaa33ff, emissive: 0x8800ff, type: 'torus', phase: 2.4 },
  { x: 1.5, z: -7.5, color: 0x33ffaa, emissive: 0x00cc77, type: 'icosahedron', phase: 3.6 },
  { x: -1.5, z: -10, color: 0xffaa33, emissive: 0xff7700, type: 'dodecahedron', phase: 4.8 },
  { x: 1.5, z: -12.5, color: 0xff33aa, emissive: 0xff0077, type: 'tetrahedron', phase: 0.7 },
  { x: 0, z: -15, color: 0xffff33, emissive: 0xffcc00, type: 'sphere', phase: 1.9 },
];

function makeGlowMaterial(baseHex: number, emissiveHex: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();

  const pulse = oscSine(time.mul(0.8).add(phase)).mul(0.35).add(0.65);
  mat.colorNode = color(baseHex);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.5);
  });

  mat.emissiveNode = color(emissiveHex).mul(pulse.mul(2.5)).add(
    color(0xffffff).mul(fresnel().mul(1.5))
  );

  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(1.3).add(phase)).mul(0.02))
  );

  mat.roughness = 0.08;
  mat.metalness = 0.6;
  return mat;
}

function makeHaloMaterial(glowHex: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const pulse = oscSine(time.mul(0.8).add(phase)).mul(0.2).add(0.8);
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(1.8);
  });

  mat.opacityNode = fresnel().mul(pulse).mul(0.5);
  mat.colorNode = color(glowHex);
  mat.emissiveNode = color(glowHex).mul(fresnel().mul(pulse).mul(3.5));
  mat.roughness = 0.0;
  return mat;
}

function makeMirrorFloorMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(3.0);
  });

  // Dark base with subtle blue tint
  mat.colorNode = vec3(0.02, 0.02, 0.04);
  // More opaque toward edges (grazing angles)
  mat.opacityNode = fresnel().mul(0.4).add(0.55);
  mat.roughness = 0.0;
  mat.metalness = 0.95;
  return mat;
}

function makeWallMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const dark = vec3(0.04, 0.02, 0.06);
    const lighter = vec3(0.08, 0.04, 0.12);
    return mix(dark, lighter, up);
  });
  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.2);
  mat.roughness = 0.8;
  mat.metalness = 0.2;
  return mat;
}

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const deep = vec3(0.01, 0.0, 0.03);
    const mid = vec3(0.03, 0.01, 0.07);
    return mix(deep, mid, up);
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.3);
  mat.roughness = 1.0;
  return mat;
}

/** Single sculpture with core + halo + Y-reflected duplicate */
function Sculpture({
  data,
}: {
  data: (typeof SCULPTURE_DATA)[0];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const reflectRef = useRef<THREE.Group>(null);
  const coreMat = useMemo(() => makeGlowMaterial(data.color, data.emissive, data.phase), [data]);
  const haloMat = useMemo(() => makeHaloMaterial(data.color, data.phase), [data]);

  const yPos = 0.5;

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3;
      groupRef.current.rotation.x += delta * 0.12;
      groupRef.current.position.y = yPos + Math.sin(Date.now() * 0.001 + data.phase) * 0.12;
    }
    if (reflectRef.current) {
      reflectRef.current.rotation.y = groupRef.current?.rotation.y ?? 0;
      reflectRef.current.rotation.x = -(groupRef.current?.rotation.x ?? 0);
      reflectRef.current.position.y = -(groupRef.current?.position.y ?? yPos);
    }
  });

  const geom = () => {
    switch (data.type) {
      case 'sphere': return <sphereGeometry args={[0.28, 24, 24]} />;
      case 'octahedron': return <octahedronGeometry args={[0.32, 1]} />;
      case 'torus': return <torusGeometry args={[0.22, 0.1, 16, 40]} />;
      case 'icosahedron': return <icosahedronGeometry args={[0.3, 1]} />;
      case 'dodecahedron': return <dodecahedronGeometry args={[0.28, 0]} />;
      case 'tetrahedron': return <tetrahedronGeometry args={[0.35, 0]} />;
      default: return <sphereGeometry args={[0.28, 16, 16]} />;
    }
  };

  return (
    <>
      {/* Main sculpture */}
      <group ref={groupRef} position={[data.x, yPos, data.z]}>
        <mesh material={coreMat}>{geom()}</mesh>
        <mesh material={haloMat} scale={[1.8, 1.8, 1.8]}>
          <sphereGeometry args={[0.3, 12, 12]} />
        </mesh>
      </group>

      {/* Y-flipped reflection */}
      <group ref={reflectRef} position={[data.x, -yPos, data.z]} scale={[1, -1, 1]}>
        <mesh material={coreMat}>{geom()}</mesh>
      </group>

      {/* Point light for local illumination */}
      <pointLight
        position={[data.x, yPos + 0.3, data.z]}
        intensity={0.6}
        color={data.color}
        distance={3}
      />
    </>
  );
}

/** Corridor walls */
function CorridorWalls() {
  const wallMat = useMemo(() => makeWallMaterial(), []);
  const wallCount = 10;
  const spacing = 2.5;

  return (
    <>
      {Array.from({ length: wallCount }, (_, i) => {
        const z = i * -spacing;
        return (
          <group key={i}>
            {/* Left wall panel */}
            <mesh position={[-2.5, 1.5, z]} material={wallMat}>
              <boxGeometry args={[0.08, 3, 2]} />
            </mesh>
            {/* Right wall panel */}
            <mesh position={[2.5, 1.5, z]} material={wallMat}>
              <boxGeometry args={[0.08, 3, 2]} />
            </mesh>
            {/* Ceiling strip */}
            <mesh position={[0, 3, z]} material={wallMat}>
              <boxGeometry args={[5, 0.08, 2]} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// Module-scope mist particle positions to avoid Math.random() during render
const MIST_POSITIONS = (() => {
  const a = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) {
    a[i * 3] = (Math.random() - 0.5) * 4;
    a[i * 3 + 1] = Math.random() * 3;
    a[i * 3 + 2] = Math.random() * -20;
  }
  return a;
})();

export default function MirrorGallery() {
  const floorMat = useMemo(() => makeMirrorFloorMaterial(), []);
  const bgMat = useMemo(() => makeBackgroundMaterial(), []);

  return (
    <>
      <ambientLight intensity={0.15} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[0, 5, 3]} intensity={0.3} color={0x8899ff} />

      {/* Background atmosphere */}
      <mesh material={bgMat}>
        <sphereGeometry args={[30, 32, 32]} />
      </mesh>

      {/* Mirror floor */}
      <mesh material={floorMat} position={[0, 0, -8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 22]} />
      </mesh>

      {/* Corridor walls */}
      <CorridorWalls />

      {/* Sculptures with reflections */}
      {SCULPTURE_DATA.map((d, i) => (
        <Sculpture key={i} data={d} />
      ))}

      {/* Atmospheric mist particles */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[MIST_POSITIONS, 3]}
          />
        </bufferGeometry>
        <pointsMaterial color={0x8866cc} size={0.02} sizeAttenuation transparent opacity={0.3} />
      </points>
    </>
  );
}
