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
  mix,
} from 'three/tsl';

export default function WireframeLandscape() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.wireframe = true;
    mat.side = THREE.DoubleSide;

    // Vertex displacement: scrolling mountain terrain
    mat.positionNode = Fn(() => {
      const x = positionLocal.x;
      const z = positionLocal.z;
      const t = time.mul(0.8);

      // Scroll the landscape toward the viewer by adding time to z
      const scrollZ = z.add(t);

      // Layer 1: broad mountain ridges
      const h1 = x.mul(0.6).sin().mul(scrollZ.mul(0.4).cos()).mul(1.2);

      // Layer 2: medium peaks
      const h2 = x.mul(1.3).add(float(0.5)).sin().mul(scrollZ.mul(0.9).sin()).mul(0.5);

      // Layer 3: fine detail ridges
      const h3 = x.mul(2.5).add(scrollZ.mul(1.8)).sin().mul(0.2);

      // Layer 4: rolling base undulation
      const h4 = scrollZ.mul(0.25).sin().mul(x.mul(0.35).cos()).mul(0.8);

      const height = h1.add(h2).add(h3).add(h4);

      return vec3(positionLocal.x, height, positionLocal.z);
    })();

    // Color: blend cyan to magenta based on height position for retro neon look
    const colorFn = Fn(() => {
      const x = positionLocal.x;
      const z = positionLocal.z;
      const t = time.mul(0.8);
      const scrollZ = z.add(t);

      // Recompute approximate height for color mapping
      const h1 = x.mul(0.6).sin().mul(scrollZ.mul(0.4).cos()).mul(1.2);
      const h2 = x.mul(1.3).add(float(0.5)).sin().mul(scrollZ.mul(0.9).sin()).mul(0.5);
      const h3 = x.mul(2.5).add(scrollZ.mul(1.8)).sin().mul(0.2);
      const h4 = scrollZ.mul(0.25).sin().mul(x.mul(0.35).cos()).mul(0.8);
      const height = h1.add(h2).add(h3).add(h4);

      // Normalize height roughly from -2.7..2.7 to 0..1
      const normalized = height.add(2.7).div(5.4).clamp(0.0, 1.0);

      const cyan = color(0x00ffff);
      const magenta = color(0xff00ff);

      return mix(cyan, magenta, normalized);
    });

    mat.colorNode = colorFn();

    // Emissive: strong self-illumination for neon wireframe glow
    const emissiveFn = Fn(() => {
      const x = positionLocal.x;
      const z = positionLocal.z;
      const t = time.mul(0.8);
      const scrollZ = z.add(t);

      const h1 = x.mul(0.6).sin().mul(scrollZ.mul(0.4).cos()).mul(1.2);
      const h2 = x.mul(1.3).add(float(0.5)).sin().mul(scrollZ.mul(0.9).sin()).mul(0.5);
      const h3 = x.mul(2.5).add(scrollZ.mul(1.8)).sin().mul(0.2);
      const h4 = scrollZ.mul(0.25).sin().mul(x.mul(0.35).cos()).mul(0.8);
      const height = h1.add(h2).add(h3).add(h4);

      const normalized = height.add(2.7).div(5.4).clamp(0.0, 1.0);

      const cyan = color(0x00ffff);
      const magenta = color(0xff00ff);

      return mix(cyan, magenta, normalized).mul(float(1.5));
    });

    mat.emissiveNode = emissiveFn();

    mat.roughness = 1.0;
    mat.metalness = 0.0;

    return mat;
  }, []);

  useFrame(() => {
    // Material animates via time uniform — no per-frame JS needed
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>
      {/* Minimal ambient — wireframe is self-lit via emissive */}
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[5, 8, 5]} intensity={0.4} />
      <mesh
        ref={meshRef}
        material={material}
        rotation={[-Math.PI / 2.8, 0, 0]}
        position={[0, -1.5, -2]}
      >
        <planeGeometry args={[10, 20, 40, 80]} />
      </mesh>
    </>
  );
}
