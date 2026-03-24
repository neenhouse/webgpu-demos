import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  positionLocal,
  Fn,
  float,
  vec3,
} from 'three/tsl';

interface RibbonConfig {
  ribbonColor: number;
  position: [number, number, number];
  rotationY: number;
  speed: number;
  phaseOffset: number;
  twistFreq: number;
}

function Ribbon({
  ribbonColor,
  position: pos,
  rotationY,
  speed,
  phaseOffset,
  twistFreq,
}: RibbonConfig) {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;

    // Vibrant base color
    mat.colorNode = color(ribbonColor);

    // Emissive glow matching the ribbon color
    mat.emissiveNode = color(ribbonColor).mul(float(0.4));

    mat.roughness = 0.35;
    mat.metalness = 0.1;

    // Twist and wave the ribbon through space
    mat.positionNode = Fn(() => {
      const t = time.mul(speed);
      const py = positionLocal.y;

      // Spiral twist: displace X and Z based on Y position + time
      const twistAngle = py.mul(twistFreq).add(t).add(float(phaseOffset));
      const spiralRadius = float(0.6).add(py.mul(0.08).sin().mul(0.2));

      const xDisplace = twistAngle.sin().mul(spiralRadius);
      const zDisplace = twistAngle.cos().mul(spiralRadius);

      // Secondary wave for organic flow
      const wave = py.mul(1.5).add(t.mul(0.7)).add(float(phaseOffset * 0.5)).sin().mul(0.3);

      // Vertical undulation
      const yWave = py.mul(0.8).add(t.mul(0.5)).sin().mul(0.15);

      return vec3(
        positionLocal.x.add(xDisplace).add(wave),
        positionLocal.y.add(yWave),
        positionLocal.z.add(zDisplace),
      );
    })();

    return mat;
  }, [ribbonColor, speed, phaseOffset, twistFreq]);

  return (
    <mesh
      ref={meshRef}
      material={material}
      position={pos}
      rotation={[0, rotationY, 0]}
    >
      <planeGeometry args={[0.3, 6, 1, 64]} />
    </mesh>
  );
}

const ribbons: RibbonConfig[] = [
  {
    ribbonColor: 0xff2244,
    position: [0, 0, 0],
    rotationY: 0,
    speed: 0.8,
    phaseOffset: 0,
    twistFreq: 1.2,
  },
  {
    ribbonColor: 0x2266ff,
    position: [1.5, 0.5, -0.5],
    rotationY: 0.6,
    speed: 0.65,
    phaseOffset: 1.5,
    twistFreq: 1.0,
  },
  {
    ribbonColor: 0x22ff66,
    position: [-1.2, -0.3, 0.8],
    rotationY: -0.4,
    speed: 0.9,
    phaseOffset: 3.0,
    twistFreq: 1.4,
  },
  {
    ribbonColor: 0xffcc00,
    position: [0.6, -0.6, 1.2],
    rotationY: 1.2,
    speed: 0.7,
    phaseOffset: 4.5,
    twistFreq: 0.9,
  },
  {
    ribbonColor: 0xff44cc,
    position: [-0.8, 0.4, -1.0],
    rotationY: -0.8,
    speed: 0.75,
    phaseOffset: 6.0,
    twistFreq: 1.1,
  },
];

export default function RibbonDance() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <directionalLight position={[-3, -2, 4]} intensity={0.3} />
      <group ref={groupRef}>
        {ribbons.map((config, i) => (
          <Ribbon key={i} {...config} />
        ))}
      </group>
    </>
  );
}
