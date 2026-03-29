import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  uniform,
  positionWorld,
  cameraPosition,
  normalWorld,
  mix,
  smoothstep,
  length,
} from 'three/tsl';

const COUNT = 500;
const GOLDEN_ANGLE = 2.39996323; // radians = 137.5°

export default function FibonacciSpiral() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const angleDeviation = useMemo(() => uniform(0.0), []);

  // Pre-compute max radius for color normalization
  const maxRadius = useMemo(() => Math.sqrt(COUNT - 1) * 0.18, []);

  // Build instance data (positions, scales by distance)
  const instanceData = useMemo(() => {
    const data: { x: number; y: number; z: number; r: number; scale: number }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const r = Math.sqrt(i) * 0.18;
      const theta = i * GOLDEN_ANGLE;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      // Slight y variation for depth
      const y = (Math.random() - 0.5) * 0.05;
      // Size: large at center, smaller toward edge
      const t = r / (Math.sqrt(COUNT) * 0.18);
      const scale = 0.18 * (1.0 - t * 0.6) + 0.04;
      data.push({ x, y, z, r, scale });
    }
    return data;
  }, []);

  // TSL material: 4-stop color gradient by radius
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    const colorByRadius = Fn(() => {
      // Compute distance from Y axis (center) in world space
      const xz = positionWorld.xz;
      const r = length(xz).div(float(maxRadius)).saturate();

      // 4-stop gradient: brown -> yellow -> orange -> red (sunflower)
      const brown = vec3(0.45, 0.22, 0.05);
      const yellow = vec3(1.0, 0.85, 0.1);
      const orange = vec3(1.0, 0.45, 0.0);
      const red = vec3(0.9, 0.05, 0.1);

      const s1 = mix(brown, yellow, smoothstep(float(0.0), float(0.33), r));
      const s2 = mix(s1, orange, smoothstep(float(0.33), float(0.66), r));
      return mix(s2, red, smoothstep(float(0.66), float(1.0), r));
    });

    mat.colorNode = colorByRadius();

    // Emissive glow: stronger on outer rings
    const glowOuter = Fn(() => {
      const xz = positionWorld.xz;
      const r = length(xz).div(float(maxRadius)).saturate();
      const glow = smoothstep(float(0.5), float(1.0), r);
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      const fresnel = float(1.0).sub(nDotV).pow(float(2.0));
      const emissiveColor = mix(
        vec3(1.0, 0.5, 0.0),
        vec3(1.0, 0.1, 0.1),
        r
      );
      return emissiveColor.mul(glow).mul(fresnel).mul(float(2.0));
    });

    mat.emissiveNode = glowOuter();
    mat.roughness = 0.3;
    mat.metalness = 0.3;

    return mat;
  }, [maxRadius]);

  const setRef = useCallback((el: THREE.InstancedMesh | null) => {
    meshRef.current = el;
    if (!el) return;
    // Initialize instance matrices
    instanceData.forEach(({ x, y, z, scale }, i) => {
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      el.setMatrixAt(i, dummy.matrix);
    });
    el.instanceMatrix.needsUpdate = true;
  }, [instanceData, dummy]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Animate: slowly deviate the golden angle, creating pattern shifts
    const deviation = Math.sin(t * 0.15) * 0.05;
    const animatedAngle = GOLDEN_ANGLE + deviation;
    angleDeviation.value = deviation;

    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < COUNT; i++) {
      const r = Math.sqrt(i) * 0.18;
      const theta = i * animatedAngle;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const inst = instanceData[i];
      const scale = inst.scale * (1.0 + Math.sin(t * 1.5 + i * 0.01) * 0.08);

      dummy.position.set(x, 0, z);
      dummy.scale.setScalar(scale);
      dummy.rotation.y = t * 0.3 + i * 0.01;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Slow tilt of the group
    if (groupRef.current) {
      groupRef.current.rotation.x = -0.6 + Math.sin(t * 0.08) * 0.15;
      groupRef.current.rotation.y = t * 0.04;
    }
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 5, 5]} intensity={2.5} color={0xffcc00} />
      <pointLight position={[3, 2, -4]} intensity={1.5} color={0xff6600} />
      <pointLight position={[-3, 3, 3]} intensity={1.2} color={0xff4444} />

      <group ref={groupRef} position={[0, 0, 0]}>
        <instancedMesh
          ref={setRef}
          args={[undefined, undefined, COUNT]}
          material={material}
        >
          <sphereGeometry args={[1, 10, 8]} />
        </instancedMesh>

        {/* Central bloom halo */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.4, 16, 12]} />
          <meshStandardMaterial
            color={0xffcc00}
            emissive={0xffcc00}
            emissiveIntensity={3}
            transparent
            opacity={0.6}
          />
        </mesh>
      </group>
    </>
  );
}
