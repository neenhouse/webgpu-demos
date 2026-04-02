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

function PlasmaCore() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;

    const px = positionLocal.x;
    const py = positionLocal.y;
    const pz = positionLocal.z;

    // Complex swirling plasma cells via layered sin patterns
    const plasmaField = Fn(() => {
      const t = time.mul(0.6);

      // Layer 1: large-scale swirl
      const cell1 = px.mul(3.0).add(py.mul(2.0)).add(t).sin()
        .mul(py.mul(2.5).sub(pz.mul(1.8)).add(t.mul(1.3)).sin())
        .mul(0.5).add(0.5);

      // Layer 2: medium plasma tendrils
      const cell2 = pz.mul(4.0).add(px.mul(3.0)).add(t.mul(0.9)).sin()
        .mul(px.mul(2.0).add(py.mul(3.5)).sub(t.mul(1.1)).sin())
        .mul(0.5).add(0.5);

      // Layer 3: fine electric detail
      const cell3 = px.mul(6.0).sub(py.mul(5.0)).add(pz.mul(4.0)).add(t.mul(1.8)).sin()
        .mul(0.5).add(0.5);

      // Layer 4: slow large undulation
      const cell4 = px.add(py).add(pz).mul(1.5).add(t.mul(0.3)).sin()
        .mul(0.5).add(0.5);

      // Combine layers with different weights
      return cell1.mul(0.35).add(cell2.mul(0.3)).add(cell3.mul(0.2)).add(cell4.mul(0.15));
    });

    const plasma = plasmaField();

    // Color: deep purple to electric blue based on plasma field
    mat.colorNode = Fn(() => {
      const deepPurple = color(0x220044);
      const electricBlue = color(0x4400ff);
      return mix(deepPurple, electricBlue, plasma);
    })();

    // Emissive: multi-layered bright plasma glow
    mat.emissiveNode = Fn(() => {
      const t = time.mul(0.6);

      // Electric discharge pattern — sharp bright lines
      const discharge1 = px.mul(8.0).add(py.mul(6.0)).add(t.mul(2.0)).sin()
        .mul(pz.mul(7.0).sub(px.mul(5.0)).add(t.mul(1.7)).sin());
      const sharpGlow1 = discharge1.mul(discharge1).mul(discharge1).clamp(0.0, 1.0);

      // Second discharge layer at different frequency
      const discharge2 = py.mul(10.0).sub(pz.mul(8.0)).add(t.mul(2.5)).sin()
        .mul(px.mul(9.0).add(py.mul(3.0)).add(t.mul(1.4)).sin());
      const sharpGlow2 = discharge2.mul(discharge2).mul(discharge2).clamp(0.0, 1.0);

      // Slower broad glow
      const broadGlow = plasma.mul(plasma);

      // Combine discharge patterns
      const totalGlow = sharpGlow1.mul(0.4).add(sharpGlow2.mul(0.3)).add(broadGlow.mul(0.5));

      const brightPurple = color(0x8800ff);
      const brightBlue = color(0x4466ff);
      const white = color(0xccccff);

      // Mix colors based on glow intensity
      const baseEmissive = mix(brightPurple, brightBlue, plasma);
      const hotEmissive = mix(baseEmissive, white, totalGlow.clamp(0.0, 1.0));

      return hotEmissive.mul(float(2.5));
    })();

    // Subtle vertex pulsing along normals
    mat.positionNode = Fn(() => {
      const t = time.mul(0.8);
      const pulse1 = px.mul(3.0).add(py.mul(2.0)).add(t).sin().mul(0.03);
      const pulse2 = py.mul(4.0).sub(pz.mul(3.0)).add(t.mul(1.2)).sin().mul(0.02);
      const pulse3 = pz.mul(2.5).add(px.mul(1.5)).add(t.mul(0.6)).sin().mul(0.015);
      const totalPulse = pulse1.add(pulse2).add(pulse3);
      return positionLocal.add(normalLocal.mul(totalPulse));
    })();

    mat.opacityNode = float(0.9);
    mat.roughness = 0.2;
    mat.metalness = 0.0;

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
      meshRef.current.rotation.x += delta * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[1.5, 64, 64]} />
    </mesh>
  );
}

function OuterGlow() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.transparent = true;
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;

    // Fresnel-based rim glow
    mat.colorNode = color(0x220044);

    mat.emissiveNode = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const fresnel = float(1.0).sub(nDotV).pow(2.5);

      const t = time.mul(0.4);
      const shimmer = positionLocal.x.mul(3.0).add(positionLocal.y.mul(2.0)).add(t).sin()
        .mul(0.2).add(0.8);

      const glowColor = mix(color(0x6600cc), color(0x2200ff), fresnel);
      return glowColor.mul(fresnel).mul(shimmer).mul(float(1.5));
    })();

    mat.opacityNode = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const fresnel = float(1.0).sub(nDotV).pow(2.0);
      return fresnel.mul(0.35);
    })();

    mat.roughness = 0.0;
    mat.metalness = 0.0;

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
      meshRef.current.rotation.x += delta * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[1.8, 64, 64]} />
    </mesh>
  );
}

export default function PlasmaGlobe() {
  return (
    <>

      <fogExp2 attach="fog" color="#080402" density={0.04} />
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#334466', '#111122', 0.3]} />
      <directionalLight position={[3, 3, 5]} intensity={0.2} color={0x4400ff} />
      <PlasmaCore />
      <OuterGlow />
    </>
  );
}
