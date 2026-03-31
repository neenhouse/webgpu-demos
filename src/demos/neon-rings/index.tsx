import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  oscSine,
  normalWorld,
  cameraPosition,
  positionWorld,
  Fn,
  float,
} from 'three/tsl';

interface RingConfig {
  radius: number;
  tube: number;
  neonColor: number;
  axis: [number, number, number];
  speed: number;
  phase: number;
  tilt: [number, number, number];
}

function NeonRing({
  radius,
  tube,
  neonColor,
  axis,
  speed,
  phase,
  tilt,
}: RingConfig) {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Base color: dim version of the neon color
    mat.colorNode = color(neonColor).mul(float(0.3));

    // Strong emissive node with pulsing via oscSine at unique phase
    const emissiveFn = Fn(() => {
      const pulse = oscSine(time.mul(0.8).add(float(phase)))
        .mul(0.4)
        .add(0.6);
      return color(neonColor).mul(pulse).mul(float(2.0));
    });

    // Fresnel rim glow for extra edge illumination
    const fresnelFn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    // Combine emissive pulse with fresnel rim
    mat.emissiveNode = Fn(() => {
      const baseEmissive = emissiveFn();
      const rim = fresnelFn();
      return baseEmissive.add(color(neonColor).mul(rim).mul(float(1.5)));
    })();

    mat.roughness = 0.3;
    mat.metalness = 0.1;

    return mat;
  }, [neonColor, phase]);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * speed * axis[0];
      meshRef.current.rotation.y += delta * speed * axis[1];
      meshRef.current.rotation.z += delta * speed * axis[2];
    }
  });

  return (
    <mesh ref={meshRef} material={material} rotation={tilt}>
      <torusGeometry args={[radius, tube, 64, 128]} />
    </mesh>
  );
}

const rings: RingConfig[] = [
  {
    radius: 0.5,
    tube: 0.04,
    neonColor: 0xff00ff, // magenta
    axis: [1, 0.3, 0],
    speed: 0.6,
    phase: 0,
    tilt: [0.3, 0, 0],
  },
  {
    radius: 1.0,
    tube: 0.05,
    neonColor: 0x00ffff, // cyan
    axis: [0, 1, 0.2],
    speed: 0.45,
    phase: 1.2,
    tilt: [0, 0.5, 0.2],
  },
  {
    radius: 1.5,
    tube: 0.05,
    neonColor: 0xffff00, // yellow
    axis: [0.2, 0, 1],
    speed: 0.35,
    phase: 2.5,
    tilt: [0.8, 0, 0.4],
  },
  {
    radius: 2.0,
    tube: 0.06,
    neonColor: 0x00ff66, // green
    axis: [0.5, 0.5, 0],
    speed: 0.25,
    phase: 3.8,
    tilt: [0.1, 0.7, 0],
  },
  {
    radius: 2.5,
    tube: 0.06,
    neonColor: 0xff66aa, // pink
    axis: [0, 0.3, 0.7],
    speed: 0.2,
    phase: 5.0,
    tilt: [0.5, 0.2, 0.6],
  },
];

export default function NeonRings() {
  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <pointLight position={[0, 0, 0]} intensity={0.3} color={0x444466} />
      {rings.map((config, i) => (
        <NeonRing key={i} {...config} />
      ))}
    </>
  );
}
