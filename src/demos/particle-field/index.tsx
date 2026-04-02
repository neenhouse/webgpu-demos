import { useRef, useMemo, useEffect } from 'react';
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
  mix,
} from 'three/tsl';

const PARTICLE_COUNT = 2000;
const GRID_SIZE = 13; // ~13^3 = 2197, we clamp to 2000
const SPREAD = 6;

export default function ParticleField() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Build instance matrices: particles in a 3D grid/cloud
  const matrices = useMemo(() => {
    const dummy = new THREE.Object3D();
    const result: THREE.Matrix4[] = [];
    let count = 0;

    for (let ix = 0; ix < GRID_SIZE && count < PARTICLE_COUNT; ix++) {
      for (let iy = 0; iy < GRID_SIZE && count < PARTICLE_COUNT; iy++) {
        for (let iz = 0; iz < GRID_SIZE && count < PARTICLE_COUNT; iz++) {
          // Map grid indices to centered positions with some jitter
          const x =
            ((ix / (GRID_SIZE - 1)) - 0.5) * SPREAD +
            (Math.random() - 0.5) * 0.3;
          const y =
            ((iy / (GRID_SIZE - 1)) - 0.5) * SPREAD +
            (Math.random() - 0.5) * 0.3;
          const z =
            ((iz / (GRID_SIZE - 1)) - 0.5) * SPREAD +
            (Math.random() - 0.5) * 0.3;

          // Vary scale slightly per particle
          const scale = 0.06 + Math.random() * 0.06;

          dummy.position.set(x, y, z);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          result.push(dummy.matrix.clone());
          count++;
        }
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

  // TSL material: animated color gradient + emissive glow
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial();

    // Color based on world-space position: RGB channels driven by xyz
    // Creates a vivid spatial gradient that shifts over time
    const posW = positionWorld;
    const t = time.mul(0.3);

    const r = oscSine(posW.x.mul(0.8).add(t)).mul(0.5).add(0.5);
    const g = oscSine(posW.y.mul(0.8).add(t.mul(1.3))).mul(0.5).add(0.5);
    const b = oscSine(posW.z.mul(0.8).add(t.mul(0.7))).mul(0.5).add(0.5);

    // Mix between a teal base and a position-driven gradient
    const base = color(0x00ccff);
    const gradientFactor = float(1.0)
      .sub(r.mul(0.3))
      .add(g.mul(0.5))
      .add(b.mul(0.2));
    const gradient = color(0xffffff).mul(gradientFactor);
    const blendFactor = oscSine(t.mul(0.5)).mul(0.5).add(0.5);
    mat.colorNode = mix(base, gradient, blendFactor);

    // Fresnel-based emissive glow for a neon edge effect
    const fresnel = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV = normalWorld.dot(viewDir).saturate();
      return float(1.0).sub(nDotV).pow(2.5);
    });

    // Emissive shifts between magenta and cyan over time
    const emissiveColor = Fn(() => {
      const magenta = color(0xff00ff);
      const cyan = color(0x00ffff);
      const blend = oscSine(time.mul(0.2)).mul(0.5).add(0.5);
      return mix(magenta, cyan, blend);
    });

    mat.emissiveNode = emissiveColor().mul(fresnel()).mul(float(3.0));

    // Subtle vertex displacement: particles "breathe" along normals
    mat.positionNode = positionLocal.add(
      normalLocal.mul(
        oscSine(time.mul(1.5).add(positionLocal.y.mul(4.0))).mul(0.015),
      ),
    );

    mat.roughness = 0.4;
    mat.metalness = 0.6;

    return mat;
  }, []);

  // Slow rotation of the entire particle cloud
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
      groupRef.current.rotation.x += delta * 0.03;
    }
  });

  return (
    <>
      {/* Background atmosphere */}
      <mesh>
        <sphereGeometry args={[30, 16, 16]} />
        <meshBasicMaterial side={THREE.BackSide} color="#020408" />
      </mesh>

      <ambientLight intensity={0.3} />
      <directionalLight position={[8, 10, 5]} intensity={1.2} color={0xffffff} />
      <directionalLight position={[-5, -3, -8]} intensity={0.4} color={0x8888ff} />
      <pointLight position={[0, 0, 0]} intensity={2} color={0x00ffff} distance={12} />

      <group ref={groupRef}>
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, PARTICLE_COUNT]}
          material={material}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 8, 6]} />
        </instancedMesh>
      </group>
    </>
  );
}
