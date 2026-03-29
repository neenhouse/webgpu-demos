import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  time,
  positionLocal,
  normalLocal,
  Fn,
  mix,
} from 'three/tsl';

export default function ProceduralTerrain() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;

    // Vertex displacement: combine multiple sin/cos waves for rolling hills
    const displacement = Fn(() => {
      const x = positionLocal.x;
      const z = positionLocal.z;
      const t = time.mul(0.3);

      // Layer 1: large rolling hills
      const h1 = x.mul(0.8).add(t).sin().mul(z.mul(0.6).add(t.mul(0.7)).cos()).mul(0.6);

      // Layer 2: medium frequency detail
      const h2 = x.mul(1.5).add(z.mul(1.2)).add(t.mul(0.5)).sin().mul(0.3);

      // Layer 3: small ripples
      const h3 = x.mul(3.0).sub(t.mul(0.8)).cos().mul(z.mul(2.5).add(t).sin()).mul(0.1);

      // Layer 4: broad undulation
      const h4 = x.mul(0.3).add(z.mul(0.4)).sub(t.mul(0.2)).sin().mul(0.8);

      const height = h1.add(h2).add(h3).add(h4);

      return positionLocal.add(normalLocal.mul(height));
    });

    mat.positionNode = displacement();

    // Color based on displacement height (recompute height for color mapping)
    const colorMapping = Fn(() => {
      const x = positionLocal.x;
      const z = positionLocal.z;
      const t = time.mul(0.3);

      const h1 = x.mul(0.8).add(t).sin().mul(z.mul(0.6).add(t.mul(0.7)).cos()).mul(0.6);
      const h2 = x.mul(1.5).add(z.mul(1.2)).add(t.mul(0.5)).sin().mul(0.3);
      const h3 = x.mul(3.0).sub(t.mul(0.8)).cos().mul(z.mul(2.5).add(t).sin()).mul(0.1);
      const h4 = x.mul(0.3).add(z.mul(0.4)).sub(t.mul(0.2)).sin().mul(0.8);
      const height = h1.add(h2).add(h3).add(h4);

      // Normalize height to 0..1 range (height roughly -1.8 to 1.8)
      const normalized = height.add(1.8).div(3.6).saturate();

      // Deep blue for valleys
      const deepBlue = color(0x0d1a66);
      // Green for middle
      const green = color(0x1a9926);
      // White for peaks
      const white = color(0xf2f2ff);

      // Blend: blue -> green from 0..0.45, green -> white from 0.45..1.0
      const lowFactor = normalized.div(0.45).saturate();
      const highFactor = normalized.sub(0.45).div(0.55).saturate();
      const lowMix = mix(deepBlue, green, lowFactor);
      const highMix = mix(green, white, highFactor);
      const blendFactor = normalized.step(0.45).oneMinus();

      return mix(lowMix, highMix, blendFactor);
    });

    mat.colorNode = colorMapping();

    // Subtle emissive: faint glow on high peaks (snow line) and deep valleys (water)
    const emissiveMapping = Fn(() => {
      const x = positionLocal.x;
      const z = positionLocal.z;
      const t = time.mul(0.3);

      const h1 = x.mul(0.8).add(t).sin().mul(z.mul(0.6).add(t.mul(0.7)).cos()).mul(0.6);
      const h2 = x.mul(1.5).add(z.mul(1.2)).add(t.mul(0.5)).sin().mul(0.3);
      const h3 = x.mul(3.0).sub(t.mul(0.8)).cos().mul(z.mul(2.5).add(t).sin()).mul(0.1);
      const h4 = x.mul(0.3).add(z.mul(0.4)).sub(t.mul(0.2)).sin().mul(0.8);
      const height = h1.add(h2).add(h3).add(h4);
      const normalized = height.add(1.8).div(3.6).saturate();

      // Peak glow: faint blue-white on high terrain
      const peakGlow = color(0x8899ff).mul(normalized.sub(0.8).div(0.2).saturate().mul(0.4));
      // Valley glow: faint blue tint on low terrain (water)
      const valleyGlow = color(0x0022aa).mul(float(1.0).sub(normalized).mul(0.3).saturate());
      return peakGlow.add(valleyGlow);
    });

    mat.emissiveNode = emissiveMapping();

    mat.roughness = 0.8;
    mat.metalness = 0.1;

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += delta * 0.02;
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020804" />
      </mesh>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-3, 8, -4]} intensity={0.4} />
      <mesh
        ref={meshRef}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1, 0]}
      >
        <planeGeometry args={[10, 10, 128, 128]} />
      </mesh>
    </>
  );
}
