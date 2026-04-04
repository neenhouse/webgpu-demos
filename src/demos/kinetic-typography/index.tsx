import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
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
} from 'three/tsl';

/**
 * Kinetic Typography — Animated 3D text using drei's Text component (troika-three-text)
 *
 * Multiple words floating in 3D space, each with a unique animation style:
 * - Word 1: slow rotation + color pulse (main hero word)
 * - Word 2: scale breath + vertical bounce
 * - Word 3: horizontal oscillation + spin
 * - Word 4: depth push-pull
 * - Word 5: orbital path
 * - Word 6: erratic micro-shake for energy
 *
 * Background: instanced star particles, glowing sphere lights
 * Color cycling: each word shifts hue over time via useFrame
 */

const WORDS = [
  { text: 'KINETIC', position: [0, 0.5, 0] as [number, number, number], size: 0.9, color: '#ff44aa' },
  { text: 'MOTION', position: [-2, -0.8, -1] as [number, number, number], size: 0.55, color: '#44aaff' },
  { text: 'ENERGY', position: [2.2, 1.2, -0.5] as [number, number, number], size: 0.5, color: '#ffcc44' },
  { text: 'FLOW', position: [-1.8, 1.6, 0.5] as [number, number, number], size: 0.6, color: '#44ffaa' },
  { text: 'PULSE', position: [1.5, -1.4, 0.8] as [number, number, number], size: 0.5, color: '#cc44ff' },
  { text: 'WAVE', position: [0.3, -2.0, -0.3] as [number, number, number], size: 0.45, color: '#ff8844' },
];

/** Color cycling helper — shifts hue over time */
function hslCycle(h: number, t: number): string {
  const hue = ((h + t * 40) % 360).toFixed(0);
  return `hsl(${hue}, 100%, 65%)`;
}

/** An animated text word with a specific motion personality */
function KineticWord({
  text,
  position,
  size,
  baseColor,
  motionType,
  phase,
}: {
  text: string;
  position: [number, number, number];
  size: number;
  baseColor: string;
  motionType: number;
  phase: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const colorRef = useRef(baseColor);
  const timeRef = useRef(phase);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const g = groupRef.current;
    timeRef.current += delta;
    const t = timeRef.current;

    switch (motionType) {
      case 0:
        // Hero: slow Y rotation + float
        g.rotation.y = Math.sin(t * 0.4) * 0.3;
        g.rotation.x = Math.sin(t * 0.25) * 0.1;
        g.position.y = position[1] + Math.sin(t * 0.7) * 0.15;
        break;
      case 1: {
        // Scale breath + vertical bounce
        const scaleVal = 1.0 + Math.sin(t * 1.2 + phase) * 0.15;
        g.scale.setScalar(scaleVal);
        g.position.y = position[1] + Math.abs(Math.sin(t * 0.9 + phase)) * 0.3 - 0.15;
        break;
      }
      case 2:
        // Horizontal oscillation + spin
        g.position.x = position[0] + Math.sin(t * 0.8 + phase) * 0.4;
        g.rotation.z = Math.sin(t * 0.6 + phase) * 0.15;
        break;
      case 3:
        // Depth push-pull
        g.position.z = position[2] + Math.sin(t * 1.0 + phase) * 0.5;
        g.rotation.y = Math.sin(t * 0.5 + phase) * 0.25;
        break;
      case 4: {
        // Orbital path
        const orbitR = 0.25;
        g.position.x = position[0] + Math.cos(t * 0.7 + phase) * orbitR;
        g.position.y = position[1] + Math.sin(t * 0.7 + phase) * orbitR;
        g.rotation.z = t * 0.3;
        break;
      }
      case 5:
        // Erratic energy shake
        g.position.x = position[0] + (Math.random() - 0.5) * 0.015;
        g.position.y = position[1] + Math.sin(t * 2.5 + phase) * 0.08;
        g.rotation.z = Math.sin(t * 3.0 + phase) * 0.06;
        break;
    }

    // Color cycling
    colorRef.current = hslCycle(parseInt(baseColor.replace('#', ''), 16) % 360, t);
  });

  return (
    <group ref={groupRef} position={position}>
      <Text
        fontSize={size}
        color={baseColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
        letterSpacing={0.05}
      >
        {text}
      </Text>
    </group>
  );
}

function makeBackgroundMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.side = THREE.BackSide;

  const gradient = Fn(() => {
    const up = normalWorld.y.mul(0.5).add(0.5);
    const dark = vec3(0.01, 0.0, 0.03);
    const mid = vec3(0.03, 0.0, 0.08);
    return mix(dark, mid, up);
  });

  mat.colorNode = gradient();
  mat.emissiveNode = gradient().mul(0.5);
  mat.roughness = 1.0;
  return mat;
}

function makeGlowSphereMaterial(baseHex: number, phase: number) {
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.transparent = true;
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const pulse = oscSine(time.mul(0.7).add(phase)).mul(0.3).add(0.7);
  const fresnel = Fn(() => {
    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const nDotV = normalWorld.dot(viewDir).saturate();
    return float(1.0).sub(nDotV).pow(2.0);
  });

  mat.opacityNode = fresnel().mul(pulse).mul(0.35);
  mat.colorNode = color(baseHex);
  mat.emissiveNode = color(baseHex).mul(fresnel().mul(pulse).mul(2.5));
  return mat;
}

/** Background glow orbs that illuminate the text */
function GlowOrbs() {
  const orbData = useMemo(() => [
    { pos: [0, 0, -2] as [number, number, number], hex: 0xff44aa, phase: 0.0 },
    { pos: [-3, 1, -1] as [number, number, number], hex: 0x44aaff, phase: 2.1 },
    { pos: [3, -1, -1.5] as [number, number, number], hex: 0xffcc44, phase: 4.2 },
  ], []);

  const materials = useMemo(() =>
    orbData.map(o => makeGlowSphereMaterial(o.hex, o.phase)),
    [orbData]
  );

  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      {orbData.map((o, i) => (
        <mesh key={i} material={materials[i]} position={o.pos} scale={[1.8, 1.8, 1.8]}>
          <sphereGeometry args={[0.8, 16, 16]} />
        </mesh>
      ))}
    </group>
  );
}

// Module-scope particle positions to avoid Math.random() in useMemo
const PARTICLE_POSITIONS = (() => {
  const arr = new Float32Array(800 * 3);
  for (let i = 0; i < 800; i++) {
    arr[i * 3] = (Math.random() - 0.5) * 20;
    arr[i * 3 + 1] = (Math.random() - 0.5) * 12;
    arr[i * 3 + 2] = -3 - Math.random() * 8;
  }
  return arr;
})();

/** Particle field backdrop */
function ParticleField() {
  const positions = useMemo(() => PARTICLE_POSITIONS, []);

  const colorsArr = useMemo(() => {
    const arr = new Float32Array(800 * 3);
    const palette = [
      [1.0, 0.27, 0.67],
      [0.27, 0.67, 1.0],
      [1.0, 0.8, 0.27],
      [0.27, 1.0, 0.67],
    ];
    for (let i = 0; i < 800; i++) {
      const c = palette[i % palette.length];
      arr[i * 3] = c[0];
      arr[i * 3 + 1] = c[1];
      arr[i * 3 + 2] = c[2];
    }
    return arr;
  }, []);

  const pointsRef = useRef<THREE.Points>(null);
  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.z += delta * 0.02;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute args={[positions, 3]} attach="attributes-position" />
        <bufferAttribute args={[colorsArr, 3]} attach="attributes-color" />
      </bufferGeometry>
      <pointsMaterial size={0.025} sizeAttenuation vertexColors transparent opacity={0.6} />
    </points>
  );
}

export default function KineticTypography() {
  const bgMat = useMemo(() => makeBackgroundMaterial(), []);

  return (
    <>
      <ambientLight intensity={0.15} />
      <fogExp2 attach="fog" args={["#020408", 0.04]} />      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <pointLight position={[0, 3, 3]} intensity={0.8} color={0xff44aa} />
      <pointLight position={[3, -2, 2]} intensity={0.6} color={0x44aaff} />

      {/* Background */}
      <mesh material={bgMat}>
        <sphereGeometry args={[25, 32, 32]} />
      </mesh>

      <ParticleField />
      <GlowOrbs />

      {/* Kinetic words */}
      {WORDS.map((word, i) => (
        <KineticWord
          key={word.text}
          text={word.text}
          position={word.position}
          size={word.size}
          baseColor={word.color}
          motionType={i}
          phase={i * 1.047}
        />
      ))}
    </>
  );
}
