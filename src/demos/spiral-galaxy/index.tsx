import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
  color,
  positionWorld,
  Fn,
  float,
} from 'three/tsl';

const PARTICLE_COUNT = 3000;
const ARM_COUNT = 3;
const MAX_RADIUS = 5;
const TWIST_FACTOR = 3.0;

export default function SpiralGalaxy() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Build instance matrices: particles arranged in spiral arms
  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];
    const particlesPerArm = Math.floor(PARTICLE_COUNT / ARM_COUNT);

    for (let arm = 0; arm < ARM_COUNT; arm++) {
      const armOffset = (arm / ARM_COUNT) * Math.PI * 2;

      for (let i = 0; i < particlesPerArm; i++) {
        const t = i / particlesPerArm; // 0..1 along the arm
        const radius = t * MAX_RADIUS;
        const angle = armOffset + t * TWIST_FACTOR;

        // Scatter increases with distance from center
        const scatter = t * 0.6;
        const x = radius * Math.cos(angle) + (Math.random() - 0.5) * scatter;
        const z = radius * Math.sin(angle) + (Math.random() - 0.5) * scatter;
        const y = (Math.random() - 0.5) * 0.15; // thin disk

        // Scale: larger near center, smaller at edges
        const scale = 0.02 + (1 - t) * 0.025 + Math.random() * 0.008;

        dummy.position.set(x, y, z);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        result.push(dummy.matrix.clone());
      }
    }

    return result;
  }, []);

  // Apply instance matrices once the mesh is ready
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  // TSL material: warm center to cool edges with emissive glow
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Distance from center in XZ plane (world space)
    const dist = Fn(() => {
      const xz = positionWorld.xz;
      return xz.length();
    });

    // Normalized distance factor (0 at center, 1 at MAX_RADIUS)
    const distFactor = Fn(() => {
      return dist().div(float(MAX_RADIUS)).saturate();
    });

    // Color: warm white/yellow at center -> blue/purple at edges
    mat.colorNode = Fn(() => {
      const warm = color(0xfff8e7); // warm white/yellow
      const cool = color(0x4422cc); // blue-purple
      const d = distFactor();
      // Manual lerp: warm * (1 - d) + cool * d
      return warm.mul(float(1.0).sub(d)).add(cool.mul(d));
    })();

    // Emissive: strong self-lit glow matching the color gradient
    mat.emissiveNode = Fn(() => {
      const warmGlow = color(0xffcc44); // golden glow
      const coolGlow = color(0x6633ff); // purple glow
      const d = distFactor();
      const emissiveColor = warmGlow.mul(float(1.0).sub(d)).add(coolGlow.mul(d));
      // Stronger glow near center, dimmer at edges
      const intensity = float(2.5).sub(d.mul(1.5));
      return emissiveColor.mul(intensity);
    })();

    mat.roughness = 0.5;
    mat.metalness = 0.1;

    return mat;
  }, []);

  // Slow Y rotation
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.06;
    }
  });

  return (
    <>
      <ambientLight intensity={0.15} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 6, 6]} />
        </instancedMesh>
      </group>
    </>
  );
}
