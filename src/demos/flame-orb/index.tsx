import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  positionLocal,
  normalLocal,
  Fn,
  float,
  mix,
  hash,
  smoothstep,
  vec3,
} from 'three/tsl';

export default function FlameOrb() {
  const meshRef = useRef<THREE.Mesh>(null);

  const crackRef = useRef<THREE.Mesh>(null);

  // Crack overlay material: hash noise driven cracks with bright emissive
  const crackMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.alphaTest = 0.5;
    mat.side = THREE.DoubleSide;
    mat.depthWrite = false;

    // Multi-octave hash noise for crack pattern
    const crackNoise = Fn(() => {
      const t = time.mul(0.5);
      const p = positionLocal;
      const n1 = hash(p.mul(8.0).add(vec3(t, t.mul(0.7), float(0.0))));
      const n2 = hash(p.mul(16.0).add(vec3(float(3.0), t.mul(1.1), t.mul(0.4))));
      const combined = n1.mul(0.6).add(n2.mul(0.4));
      // Narrow band creates thin crack lines
      return smoothstep(0.48, 0.52, combined);
    });

    const crack = crackNoise();
    mat.opacityNode = crack;
    mat.colorNode = color(0xff8800);
    mat.emissiveNode = vec3(1.0, 0.7, 0.3).mul(crack).mul(float(3.0));
    mat.roughness = 0.3;
    mat.metalness = 0.0;

    return mat;
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Aggressive layered sin-wave displacement along normals for flickering fire shape
    const displacement = Fn(() => {
      const t = time.mul(3.0); // fast-moving for flickering
      const px = positionLocal.x;
      const py = positionLocal.y;
      const pz = positionLocal.z;

      // Layer 1: large, fast flicker
      const wave1 = px.mul(3.0).add(py.mul(2.0)).add(t.mul(1.2)).sin()
        .mul(py.mul(4.0).add(pz.mul(2.5)).add(t.mul(0.9)).sin())
        .mul(0.25);

      // Layer 2: upward flame bias — stronger displacement at top (positive Y)
      const upBias = py.add(1.0).mul(0.5).clamp(0.0, 1.0); // 0 at bottom, 1 at top
      const wave2 = py.mul(5.0).add(t.mul(2.5)).sin()
        .mul(px.mul(3.5).add(t.mul(1.8)).sin())
        .mul(0.2)
        .mul(upBias);

      // Layer 3: high-frequency flicker detail
      const wave3 = px.mul(7.0).add(py.mul(6.0)).add(pz.mul(5.0)).add(t.mul(4.0)).sin()
        .mul(0.08);

      // Layer 4: medium swirl
      const wave4 = pz.mul(4.0).add(px.mul(3.0)).add(t.mul(2.0)).sin()
        .mul(py.mul(2.0).add(t.mul(1.5)).sin())
        .mul(0.12);

      return wave1.add(wave2).add(wave3).add(wave4);
    });

    const disp = displacement();

    // Displace vertices along their normals
    mat.positionNode = positionLocal.add(normalLocal.mul(disp));

    // Color: deep red -> orange -> bright yellow based on displacement amount
    mat.colorNode = Fn(() => {
      // Map displacement into a 0..1 blend factor
      const blend = disp.mul(2.5).add(0.5).clamp(0.0, 1.0);
      const deepRed = color(0x880000);
      const hotOrange = color(0xff6600);
      const brightYellow = color(0xffff00);
      // Two-stage blend: red -> orange -> yellow
      const midColor = mix(deepRed, hotOrange, blend);
      return mix(midColor, brightYellow, blend.mul(blend));
    })();

    // Emissive: fire is self-lit, strong warm glow matching the color palette
    mat.emissiveNode = Fn(() => {
      const blend = disp.mul(2.5).add(0.5).clamp(0.0, 1.0);
      const emRed = color(0xaa2200);
      const emOrange = color(0xff8800);
      const emYellow = color(0xffdd44);
      const midEm = mix(emRed, emOrange, blend);
      return mix(midEm, emYellow, blend.mul(blend)).mul(float(2.0));
    })();

    mat.roughness = 0.9;
    mat.metalness = 0.0;

    return mat;
  }, []);

  // Slow Y rotation for both meshes
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2;
    }
    if (crackRef.current) {
      crackRef.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#040208" />
      </mesh>
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#443322', '#221111', 0.3]} />
      <directionalLight position={[5, 8, 5]} intensity={0.4} />
      <mesh ref={meshRef} material={material}>
        <icosahedronGeometry args={[1.5, 4]} />
      </mesh>
      {/* Crack overlay: slightly larger shell with hash noise driven glowing cracks */}
      <mesh ref={crackRef} material={crackMaterial}>
        <icosahedronGeometry args={[1.55, 4]} />
      </mesh>
    </>
  );
}
