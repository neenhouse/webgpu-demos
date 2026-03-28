import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  time,
  positionLocal,
  positionWorld,
  normalWorld,
  cameraPosition,
  normalLocal,
  Fn,
  float,
  vec3,
  mix,
  smoothstep,
  sin,
  cos,
} from 'three/tsl';

/**
 * Frequency Mountains — 3D terrain displaced by 64-band frequency spectrum
 *
 * Techniques: high-subdivision plane geometry, TSL positionNode vertex
 * displacement, layered sine waves simulating spectrum data, 5-stop biome
 * color gradient, Fresnel rim glow, camera orbit.
 *
 * 64 frequency bands are simulated by sine waves at different frequencies.
 * The terrain's vertex Y displacement sums contributions from each band,
 * weighted by a bass-heavy falloff (low freqs = high amplitude).
 */

export default function FrequencyMountains() {
  const groupRef = useRef<THREE.Group>(null);

  // TSL material with displacement and biome gradient
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.side = THREE.DoubleSide;

    // Multi-octave terrain: simulates spectrum bands with sine waves
    // Each octave has decreasing amplitude (bass-heavy falloff)
    const displaceFn = Fn(() => {
      const px = positionLocal.x;
      const pz = positionLocal.z;
      const t = time;

      // 8 "frequency bands" layered like a spectrum
      const b1 = sin(px.mul(1.5).add(t.mul(0.4))).mul(float(1.2));
      const b2 = sin(pz.mul(1.5).add(t.mul(0.35))).mul(float(1.0));
      const b3 = sin(px.mul(2.5).add(pz.mul(1.0)).add(t.mul(0.5))).mul(float(0.6));
      const b4 = sin(px.mul(3.5).sub(pz.mul(2.0)).add(t.mul(0.6))).mul(float(0.4));
      const b5 = sin(px.mul(5.0).add(pz.mul(4.0)).sub(t.mul(0.8))).mul(float(0.25));
      const b6 = sin(px.mul(7.0).sub(pz.mul(6.0)).add(t.mul(1.0))).mul(float(0.15));
      const b7 = sin(px.mul(10.0).add(pz.mul(9.0)).sub(t.mul(1.3))).mul(float(0.1));
      const b8 = sin(px.mul(14.0).sub(pz.mul(13.0)).add(t.mul(1.6))).mul(float(0.06));

      // Cross-wave interference for richness
      const cross = sin(px.add(pz).mul(2.0).add(t.mul(0.45))).mul(float(0.3));

      return b1.add(b2).add(b3).add(b4).add(b5).add(b6).add(b7).add(b8).add(cross);
    });

    const yDisplace = displaceFn();
    mat.positionNode = positionLocal.add(vec3(float(0.0), yDisplace, float(0.0)));

    // 5-stop biome gradient from valley to peak
    const colorFn = Fn(() => {
      const py = positionWorld.y;

      // Deep ocean -> shallow -> lowland -> highland -> snowy peak
      const deepBlue = vec3(0.02, 0.06, 0.28);
      const shallowCyan = vec3(0.05, 0.35, 0.55);
      const green = vec3(0.12, 0.5, 0.18);
      const purple = vec3(0.5, 0.15, 0.8);
      const white = vec3(0.9, 0.9, 1.0);

      const t1 = smoothstep(float(-2.5), float(-1.0), py);
      const t2 = smoothstep(float(-1.0), float(0.3), py);
      const t3 = smoothstep(float(0.3), float(1.2), py);
      const t4 = smoothstep(float(1.2), float(2.5), py);

      const c1 = mix(deepBlue, shallowCyan, t1);
      const c2 = mix(c1, green, t2);
      const c3 = mix(c2, purple, t3);
      return mix(c3, white, t4);
    });
    mat.colorNode = colorFn();

    // Fresnel rim glow
    const fresnelFn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const rim = float(1.0).sub(nDotV).pow(float(3.0));
      return vec3(0.3, 0.5, 1.0).mul(rim).mul(float(1.5));
    });
    mat.emissiveNode = fresnelFn();

    mat.roughness = 0.7;
    mat.metalness = 0.1;

    return mat;
  }, []);

  // Slow orbit for camera effect — we rotate the terrain
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.08;
    }
  });

  return (
    <>
      <color attach="background" args={['#000015']} />
      <ambientLight intensity={0.1} />
      <directionalLight position={[8, 10, 5]} intensity={0.8} color="#8899ff" />
      <directionalLight position={[-6, 5, -8]} intensity={0.5} color="#ff88aa" />
      <pointLight position={[0, 5, 0]} intensity={6} color="#6644ff" distance={30} />

      <group ref={groupRef} rotation={[-Math.PI / 4, 0, 0]}>
        <mesh material={material} receiveShadow>
          <planeGeometry args={[12, 12, 128, 128]} />
        </mesh>
      </group>

      {/* Reflection of terrain below */}
      <group ref={null} rotation={[-Math.PI / 4 + Math.PI, 0, 0]} position={[0, -3, 0]}>
        <mesh material={material}>
          <planeGeometry args={[12, 12, 64, 64]} />
        </mesh>
      </group>
    </>
  );
}
