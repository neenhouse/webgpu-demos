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
  positionLocal,
  normalLocal,
  Fn,
  float,
} from 'three/tsl';

export default function TslTorus() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Animated blue color
    mat.colorNode = color(0x0088ff).mul(
      oscSine(time.mul(0.5)).mul(0.5).add(0.5),
    );

    // Fresnel rim glow
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });
    mat.emissiveNode = color(0x00ffff).mul(fresnel());

    // Subtle vertex displacement
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(2.0).add(positionLocal.y)).mul(0.03)),
    );

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <mesh ref={meshRef} material={material}>
        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
      </mesh>
    </>
  );
}
