import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  positionLocal,
  normalWorld,
  cameraPosition,
  positionWorld,
  normalLocal,
  Fn,
  float,
  mix,
} from 'three/tsl';

export default function MorphingSphere() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Layered sine displacement along normals for organic morph
    const displacement = Fn(() => {
      const t = time.mul(0.8);
      const px = positionLocal.x;
      const py = positionLocal.y;
      const pz = positionLocal.z;

      // Layer 1: low frequency, large amplitude
      const wave1 = px.mul(2.0).add(t).sin()
        .mul(py.mul(1.5).add(t.mul(0.7)).sin())
        .mul(0.15);

      // Layer 2: medium frequency
      const wave2 = py.mul(3.5).add(t.mul(1.3)).sin()
        .mul(pz.mul(2.8).add(t.mul(0.9)).sin())
        .mul(0.08);

      // Layer 3: high frequency detail
      const wave3 = pz.mul(5.0).add(px.mul(4.0)).add(t.mul(1.6)).sin()
        .mul(0.04);

      // Layer 4: slow undulation
      const wave4 = px.add(py).add(pz).mul(1.2).add(t.mul(0.4)).sin()
        .mul(0.12);

      return wave1.add(wave2).add(wave3).add(wave4);
    });

    const disp = displacement();

    // Displace vertices along their normals
    mat.positionNode = positionLocal.add(normalLocal.mul(disp));

    // Warm orange/red palette shifting with displacement
    mat.colorNode = Fn(() => {
      // Map displacement to a 0..1 range for color blending
      const blend = disp.mul(3.0).add(0.5).clamp(0.0, 1.0);
      const deepRed = color(0xcc2200);
      const warmOrange = color(0xff8833);
      const brightYellow = color(0xffcc44);
      // Two-stage blend: red -> orange -> yellow based on displacement
      const midColor = mix(deepRed, warmOrange, blend);
      return mix(midColor, brightYellow, blend.mul(blend));
    })();

    // Fresnel rim glow in orange
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(3.0);
    });

    mat.emissiveNode = color(0xff6600).mul(fresnel()).mul(float(1.5));

    mat.roughness = 0.4;
    mat.metalness = 0.1;

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <directionalLight position={[-3, -2, -4]} intensity={0.3} color={0xff4400} />
      <mesh ref={meshRef} material={material}>
        <icosahedronGeometry args={[1.5, 4]} />
      </mesh>
    </>
  );
}
