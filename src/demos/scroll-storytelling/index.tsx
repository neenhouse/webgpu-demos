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
 * Scroll Storytelling — Simulated scroll-driven camera path through 5 floating sections
 *
 * Since drei ScrollControls conflicts with the Viewer overlay, we simulate scroll
 * progress using time-based auto-advance. The camera glides through 5 narrative
 * sections, each with unique geometry and color palette.
 *
 * Techniques:
 * - Smooth camera lerp along a pre-defined path (5 waypoints)
 * - Per-section geometry: ring, icosahedron, torus knot, crystal cluster, octahedron
 * - TSL materials with Fresnel glow and animated emissive
 * - BackSide atmosphere sphere with deep-space gradient
 * - Floating animation on section groups via useFrame
 */

const SECTION_COLORS = [
  { base: 0xff6644, emissive: 0xff3300, glow: 0xff8866 },
  { base: 0x44aaff, emissive: 0x0066ff, glow: 0x66ccff },
  { base: 0xaa44ff, emissive: 0x7700ff, glow: 0xcc88ff },
  { base: 0x44ffaa, emissive: 0x00cc66, glow: 0x88ffcc },
  { base: 0xffcc44, emissive: 0xff9900, glow: 0xffee88 },
];

// Camera waypoints for the journey
const CAMERA_PATH: [number, number, number][] = [
  [0, 0, 8],
  [4, 1, 4],
  [-3, -0.5, 0],
  [5, 2, -4],
  [0, 0, -8],
];

const LOOK_AT_PATH: [number, number, number][] = [
  [0, 0, 4],
  [4, 0, 0],
  [-3, 0, -4],
  [4, 1, -8],
  [0, 0, -12],
];

function makeSectionMaterial(baseHex: number, emissiveHex: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  const pulse = oscSine(time.mul(0.8).add(phase)).mul(0.3).add(0.7);
  mat.colorNode = color(baseHex);

  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.5);
  });

  mat.emissiveNode = color(emissiveHex).mul(pulse.mul(2.5)).add(
    color(0xffffff).mul(fresnel().mul(pulse.mul(1.5)))
  );

  // Breathing displacement
  mat.positionNode = positionLocal.add(
    normalLocal.mul(oscSine(time.mul(1.4).add(phase)).mul(0.03))
  );

  mat.roughness = 0.15;
  mat.metalness = 0.4;
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
  mat.emissiveNode = color(glowHex).mul(fresnel().mul(pulse).mul(3.0));
  mat.roughness = 0.0;
  return mat;
}

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  const gradient = Fn(() => {
    const n = normalWorld;
    const up = n.y.mul(0.5).add(0.5);
    const deepSpace = vec3(0.01, 0.01, 0.06);
    const midSpace = vec3(0.04, 0.02, 0.12);
    return mix(deepSpace, midSpace, up);
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.4);
  mat.roughness = 1.0;
  return mat;
}

/** A floating section with its unique geometry */
function Section({
  position,
  colors,
  phase,
  type,
}: {
  position: [number, number, number];
  colors: (typeof SECTION_COLORS)[0];
  phase: number;
  type: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const coreMat = useMemo(() => makeSectionMaterial(colors.base, colors.emissive, phase), [colors, phase]);
  const haloMat = useMemo(() => makeHaloMaterial(colors.glow, phase), [colors.glow, phase]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.2;
      groupRef.current.rotation.x += delta * 0.07;
    }
  });

  const geometry = useMemo(() => {
    switch (type % 5) {
      case 0: return <torusGeometry args={[0.8, 0.28, 20, 60]} />;
      case 1: return <icosahedronGeometry args={[0.75, 2]} />;
      case 2: return <torusKnotGeometry args={[0.5, 0.18, 120, 16, 2, 3]} />;
      case 3: return <dodecahedronGeometry args={[0.7, 0]} />;
      case 4: return <octahedronGeometry args={[0.8, 2]} />;
      default: return <icosahedronGeometry args={[0.75, 2]} />;
    }
  }, [type]);

  return (
    <group ref={groupRef} position={position}>
      <mesh material={coreMat}>
        {geometry}
      </mesh>
      <mesh material={haloMat} scale={[1.7, 1.7, 1.7]}>
        <icosahedronGeometry args={[0.75, 2]} />
      </mesh>
    </group>
  );
}

/** Ambient star particles */
function StarField() {
  const positions = useMemo(() => {
    const arr = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const r = 12 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute args={[positions, 3]} attach="attributes-position" />
      </bufferGeometry>
      <pointsMaterial color={0xffffff} size={0.04} sizeAttenuation transparent opacity={0.7} />
    </points>
  );
}

export default function ScrollStorytelling() {
  const cameraRef = useRef({ progress: 0 });
  const camPosRef = useRef(new THREE.Vector3(...CAMERA_PATH[0]));
  const camLookRef = useRef(new THREE.Vector3(...LOOK_AT_PATH[0]));

  const bgMat = useMemo(() => makeBackgroundMaterial(), []);

  useFrame(({ camera }, delta) => {
    // Auto-advance scroll progress over 30 seconds, looping
    cameraRef.current.progress = (cameraRef.current.progress + delta * 0.033) % 1;
    const t = cameraRef.current.progress;

    // Map [0,1] to segment index and local t
    const totalSegments = CAMERA_PATH.length - 1;
    const scaledT = t * totalSegments;
    const segIdx = Math.min(Math.floor(scaledT), totalSegments - 1);
    const segT = scaledT - segIdx;

    // Smooth step for ease in/out
    const st = segT * segT * (3 - 2 * segT);

    const p0 = CAMERA_PATH[segIdx];
    const p1 = CAMERA_PATH[segIdx + 1];
    const l0 = LOOK_AT_PATH[segIdx];
    const l1 = LOOK_AT_PATH[segIdx + 1];

    const targetPos = new THREE.Vector3(
      p0[0] + (p1[0] - p0[0]) * st,
      p0[1] + (p1[1] - p0[1]) * st,
      p0[2] + (p1[2] - p0[2]) * st,
    );

    const targetLook = new THREE.Vector3(
      l0[0] + (l1[0] - l0[0]) * st,
      l0[1] + (l1[1] - l0[1]) * st,
      l0[2] + (l1[2] - l0[2]) * st,
    );

    camPosRef.current.lerp(targetPos, delta * 2.0);
    camLookRef.current.lerp(targetLook, delta * 2.0);

    camera.position.copy(camPosRef.current);
    camera.lookAt(camLookRef.current);
  });

  // Section positions along the camera path
  const sectionPositions: [number, number, number][] = [
    [0, 0, 4],
    [4, 0, 0],
    [-3, 0, -4],
    [4, 1, -8],
    [0, 0, -12],
  ];

  return (
    <>
      <ambientLight intensity={0.05} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />

      {/* Deep space background */}
      <mesh material={bgMat}>
        <sphereGeometry args={[28, 32, 32]} />
      </mesh>

      <StarField />

      {/* Five narrative sections */}
      {sectionPositions.map((pos, i) => (
        <Section
          key={i}
          position={pos}
          colors={SECTION_COLORS[i]}
          phase={i * 1.26}
          type={i}
        />
      ))}

      {/* Connecting thread particles between sections */}
      {sectionPositions.slice(0, -1).map((pos, i) => {
        const next = sectionPositions[i + 1];
        const midX = (pos[0] + next[0]) / 2;
        const midY = (pos[1] + next[1]) / 2;
        const midZ = (pos[2] + next[2]) / 2;
        return (
          <mesh key={`connector-${i}`} position={[midX, midY, midZ]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color={0xffffff} emissive={0xffffff} emissiveIntensity={0.8} />
          </mesh>
        );
      })}
    </>
  );
}
