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
} from 'three/tsl';

export default function OceanSurface() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;

    // Compute wave height from layered sin/cos for reuse in position, color, and emissive
    const waveHeight = Fn(() => {
      const x = positionLocal.x;
      const z = positionLocal.z;
      const t = time.mul(0.6);

      // Wave 1: broad ocean swell
      const w1 = x.mul(0.4).add(z.mul(0.3)).add(t.mul(0.8)).sin().mul(0.45);

      // Wave 2: cross-swell at a different angle
      const w2 = x.mul(0.3).sub(z.mul(0.5)).add(t.mul(0.6)).cos().mul(0.35);

      // Wave 3: medium chop
      const w3 = x.mul(1.2).add(z.mul(0.8)).add(t.mul(1.3)).sin().mul(0.2);

      // Wave 4: shorter wavelength detail
      const w4 = x.mul(2.0).sub(z.mul(1.5)).add(t.mul(1.8)).cos().mul(0.1);

      // Wave 5: fine ripples
      const w5 = x.mul(3.5).add(z.mul(2.8)).sub(t.mul(2.2)).sin().mul(0.06);

      // Wave 6: subtle cross-ripple
      const w6 = x.mul(1.8).add(z.mul(3.0)).add(t.mul(1.0)).cos().mul(0.08);

      return w1.add(w2).add(w3).add(w4).add(w5).add(w6);
    });

    // Vertex displacement: displace along the normal by wave height
    mat.positionNode = Fn(() => {
      const height = waveHeight();
      return positionLocal.add(normalLocal.mul(height));
    })();

    // Color: mix deep blue and light cyan based on wave height
    mat.colorNode = Fn(() => {
      const height = waveHeight();
      // Normalize height roughly from [-1.2, 1.2] to [0, 1]
      const normalized = height.add(1.2).div(2.4).saturate();

      const deepBlue = color(0x001144);
      const lightCyan = color(0x44ccff);

      return mix(deepBlue, lightCyan, normalized);
    })();

    // Emissive: subtle blue-white highlights on wave peaks
    mat.emissiveNode = Fn(() => {
      const height = waveHeight();
      // Only emit on upper peaks (above ~0.4)
      const peakFactor = height.sub(0.3).div(0.9).saturate();
      const highlight = color(0x88ccff);
      return highlight.mul(peakFactor.mul(float(0.4)));
    })();

    // Glossy water look
    mat.roughnessNode = float(0.1);
    mat.metalnessNode = float(0.2);

    return mat;
  }, []);

  useFrame(() => {
    // Material updates via TSL time node, no manual work needed
  });

  return (
    <>
      {/* Warm directional sun light */}
      <directionalLight
        position={[5, 8, 3]}
        intensity={1.5}
        color={0xffeedd}
        castShadow
      />
      {/* Ambient fill */}
      <ambientLight intensity={0.25} color={0x334466} />
      {/* Secondary rim light */}
      <directionalLight
        position={[-4, 5, -6]}
        intensity={0.4}
        color={0x88aacc}
      />
      <mesh
        ref={meshRef}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.5, 0]}
      >
        <planeGeometry args={[12, 12, 128, 128]} />
      </mesh>
    </>
  );
}
