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
  hash,
  smoothstep,
  mix,
} from 'three/tsl';

export default function NoiseDissolve() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;
    mat.transparent = true;
    mat.alphaTest = 0.5;

    // Animated dissolve threshold: cycles slowly between 0.1 and 0.9
    // so we always see partial dissolve (never fully gone, never fully solid)
    const threshold = oscSine(time.mul(0.2)).mul(0.4).add(0.5);

    // Multi-octave hash noise for more interesting dissolve pattern
    // Combine different frequencies for varied detail
    const noise1 = hash(positionLocal.mul(25));
    const noise2 = hash(positionLocal.mul(67));
    const noise3 = hash(positionLocal.mul(143));
    // Blend octaves: large pattern + medium detail + fine detail
    const noise = noise1.mul(0.5).add(noise2.mul(0.3)).add(noise3.mul(0.2));

    // Alpha: 0 when noise < threshold (discarded by alphaTest), 1 when above
    const alpha = smoothstep(threshold.sub(0.02), threshold.add(0.02), noise);
    mat.opacityNode = alpha;

    // Edge glow: fragments near the dissolve boundary glow hot
    const edge = smoothstep(threshold, threshold.add(0.1), noise);
    const edgeGlow = float(1.0).sub(edge);

    // Base color: cool dark teal metallic
    const baseColor = color(0x1a3344);

    // Edge colors: hot orange core to bright yellow-white at edge
    const hotOrange = color(0xff5500);
    const hotYellow = color(0xffee88);

    // Combine: dark base transitions to hot edge colors near dissolve boundary
    const edgeColor = mix(hotYellow, hotOrange, edge);
    mat.colorNode = mix(baseColor, edgeColor, edgeGlow.pow(0.6));

    // Fresnel rim glow
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    // Emissive: hot burning edges + teal fresnel rim
    const rimEmissive = color(0x33bbaa).mul(fresnel()).mul(0.8);
    const edgeEmissive = edgeColor.mul(edgeGlow.mul(4.0));
    mat.emissiveNode = rimEmissive.add(edgeEmissive);

    // Subtle vertex displacement - breathing effect
    mat.positionNode = positionLocal.add(
      normalLocal.mul(oscSine(time.mul(0.8).add(positionLocal.y.mul(2.0))).mul(0.015)),
    );

    mat.roughness = 0.35;
    mat.metalness = 0.6;

    return mat;
  }, []);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
      meshRef.current.rotation.x += delta * 0.06;
    }
  });

  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 8, 5]} intensity={1.0} />
      <directionalLight position={[-4, -2, -6]} intensity={0.3} color={0x6688aa} />
      <pointLight position={[0, 0, 0]} intensity={3.0} color={0xff8844} distance={6} />
      <pointLight position={[3, 2, 3]} intensity={1.0} color={0x44ccaa} distance={10} />
      <mesh ref={meshRef} material={material}>
        <dodecahedronGeometry args={[1.5, 6]} />
      </mesh>
    </>
  );
}
